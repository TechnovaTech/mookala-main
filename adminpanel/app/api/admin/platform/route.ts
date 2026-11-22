import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp, requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { diff, logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { approvalHeldResponse, gateSensitiveAction } from '@/lib/approvals';
import {
  POLICY_LINK_KEYS,
  auditShape,
  getPlatformConfig,
  maintenanceStatus,
  policyLinks,
  savePlatformConfig,
  validatePlatformConfig,
  type PlatformConfig,
} from '@/lib/platform-config';
import { MAINTENANCE_ENFORCEMENT, noticesForWindows, syncMaintenanceNotices } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

/** The published version of each policy the links point to. */
async function publishedPolicies(db: Db) {
  const rows = await db
    .collection('policies')
    .find({ status: 'published', type: { $in: POLICY_LINK_KEYS } }, { projection: { type: 1, title: 1, version: 1, effectiveDate: 1, publishedAt: 1 } })
    .toArray();
  return Object.fromEntries(rows.map((p) => [p.type, { id: String(p._id), title: p.title, version: p.version, effectiveDate: p.effectiveDate || null, publishedAt: p.publishedAt || null }]));
}

/** Whether an approved template exists for each channel the advance notices use. */
async function noticeTemplates(db: Db, config: PlatformConfig) {
  const rows = await db
    .collection('notificationTemplates')
    .find({ key: config.advanceNotice.templateKey, channel: { $in: config.advanceNotice.channels } }, { projection: { channel: 1, status: 1 } })
    .toArray();
  return config.advanceNotice.channels.map((channel) => {
    const found = rows.filter((r) => r.channel === channel);
    const approved = found.some((r) => r.status === 'approved');
    return { channel, status: approved ? 'approved' : found[0]?.status || 'missing' };
  });
}

/** Platform configuration (requirements section 15). */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'platform:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const config = await getPlatformConfig(db);
    const [policies, notices, templates] = await Promise.all([
      publishedPolicies(db),
      noticesForWindows(db, config.maintenanceWindows.map((w) => w.id)),
      noticeTemplates(db, config),
    ]);

    return ok({
      config,
      maintenance: maintenanceStatus(config),
      policyLinks: policyLinks(config),
      policies,
      notices,
      noticeTemplates: templates,
      enforcement: MAINTENANCE_ENFORCEMENT,
      serverTime: new Date(),
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

    // Maintenance starts now either through the switch or through a window that covers the current time.
    const now = new Date();
    const wasActive = maintenanceStatus(current, now).active;
    const willBeActive = maintenanceStatus({ ...checked.value }, now);
    const switchingOn = !wasActive && willBeActive.active;
    if (switchingOn && body.confirmMaintenance !== true) {
      return fail(
        willBeActive.source === 'window'
          ? 'A maintenance window covers the current time, so saving starts maintenance immediately. This needs an explicit confirmation.'
          : 'Switching maintenance mode on needs an explicit confirmation',
        409,
        { needsMaintenanceConfirmation: true }
      );
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
    const after = maintenanceStatus(saved);

    await logAudit({
      admin: check.admin,
      action: switchingOn ? 'maintenance_on' : wasActive && !after.active ? 'maintenance_off' : 'update',
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

    // The configuration is saved either way; a failure here is reported, not hidden.
    let notices: Awaited<ReturnType<typeof syncMaintenanceNotices>> = [];
    let noticeError: string | null = null;
    try {
      notices = await syncMaintenanceNotices(db, { before: current, after: saved, admin: check.admin, reason, request });
    } catch (error) {
      console.error('Maintenance notice sync failed:', error);
      noticeError = 'The configuration was saved, but the advance notice announcements could not be updated. Save again to retry.';
    }

    return ok({ config: saved, maintenance: after, notices, noticeError });
  } catch (error) {
    console.error('Save platform configuration failed:', error);
    return fail('Failed to save the platform configuration', 500);
  }
}
