import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp, requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { diff, logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { approvalHeldResponse, gateSensitiveAction } from '@/lib/approvals';
import { auditShape, getPlatformConfig, maintenanceStatus, savePlatformConfig, validatePlatformConfig } from '@/lib/platform-config';

export const dynamic = 'force-dynamic';

/** Platform configuration (requirements section 15). */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'platform:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const config = await getPlatformConfig(db);

    // A real round trip to the database, so the status shown is measured, not assumed.
    let database: { ok: boolean; latencyMs: number | null } = { ok: false, latencyMs: null };
    try {
      const started = Date.now();
      await db.command({ ping: 1 });
      database = { ok: true, latencyMs: Date.now() - started };
    } catch {
      database = { ok: false, latencyMs: null };
    }

    return ok({
      config,
      maintenance: maintenanceStatus(config),
      system: { database, checkedAt: new Date() },
      canManage: can(check.admin, 'platform:manage'),
    });
  } catch (error) {
    console.error('Load platform configuration failed:', error);
    return fail('Failed to load the platform configuration', 500);
  }
}

export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request, 'platform:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    if (!reason) return fail('A reason is required to change the platform configuration');

    const checked = validatePlatformConfig(body.config);
    if (!checked.ok) return fail(checked.error);

    const { db } = await connectToDatabase();
    const current = await getPlatformConfig(db);

    const switchingOn = !current.maintenance.enabled && checked.value.maintenance.enabled;
    if (switchingOn && body.confirmMaintenance !== true) {
      return fail('Switching maintenance mode on needs an explicit confirmation', 409, { needsMaintenanceConfirmation: true });
    }

    const changes = diff(auditShape(current), auditShape(checked.value));
    if (Object.keys(changes.after).length === 0) return ok({ config: current, unchanged: true });

    // A second approver, when the security settings ask for one ("platform_config"). A new
    // maintenance window gets a random id when it is checked, so the hash leaves window ids out.
    const proposed = auditShape(checked.value);
    const { approvalId: _ignored, ...replayBody } = body as Record<string, any>;
    const gate = await gateSensitiveAction(db, {
      action: 'platform_config',
      admin: check.admin,
      entityType: 'platform-config',
      entityId: 'platform',
      entityLabel: 'Platform configuration',
      before: changes.before,
      after: changes.after,
      payload: { ...proposed, maintenanceWindows: proposed.maintenanceWindows.map(({ id: _id, ...window }) => window) },
      reason,
      approvalId: asString(body.approvalId, 40) || null,
      replay: { method: 'PUT', path: '/api/admin/platform', body: replayBody },
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    });
    if (!gate.proceed) return approvalHeldResponse(gate);

    const saved = await savePlatformConfig(db, checked.value, check.admin.email || null);

    await logAudit({
      admin: check.admin,
      action: switchingOn ? 'maintenance_on' : current.maintenance.enabled && !saved.maintenance.enabled ? 'maintenance_off' : 'update',
      module: 'platform',
      entityType: 'platform-config',
      entityId: 'platform',
      entityLabel: 'Platform configuration',
      before: changes.before,
      after: changes.after,
      reason,
      meta: gate.approval ? { approvalId: String(gate.approval._id), requestedBy: gate.approval.requestedBy, approvedBy: gate.approval.decidedBy } : undefined,
      request,
    });

    return ok({ config: saved, maintenance: maintenanceStatus(saved) });
  } catch (error) {
    console.error('Save platform configuration failed:', error);
    return fail('Failed to save the platform configuration', 500);
  }
}
