import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { MIN_REASON, SUPPORT_SETTINGS_TYPE, getSupportSettings, parseSlaInput } from '@/lib/resources/support.hooks';

export const dynamic = 'force-dynamic';

/**
 * SLA targets per priority, in the settings document { type: 'support' }.
 *   GET  (support:view)   the targets and their change history
 *   PUT  (support:manage) { sla: { low|normal|high|urgent: { responseHours, resolutionHours } }, reason }
 * An empty value means "no target". Every change needs a reason and is audited.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'support:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const [settings, history] = await Promise.all([
      getSupportSettings(db),
      db.collection('auditLogs').find({ entityType: 'support-settings' }).sort({ createdAt: -1 }).limit(30).toArray(),
    ]);
    return ok({
      ...settings,
      history: history.map((h) => ({ ...h, _id: String(h._id) })),
      canManage: can(check.admin, 'support:manage'),
    });
  } catch (error) {
    console.error('Support settings failed:', error);
    return fail('Failed to load the support settings', 500);
  }
}

export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request, 'support:manage');
  if (!check.ok) return check.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid request body', 400);
  const reason = asString(body.reason, 500);
  if (reason.length < MIN_REASON) return fail(`A reason of at least ${MIN_REASON} characters is required to change the SLA targets.`, 400);
  const sla = parseSlaInput(body.sla);
  if (typeof sla === 'string') return fail(sla, 400);

  try {
    const { db } = await connectToDatabase();
    const current = await getSupportSettings(db);
    if (JSON.stringify(current.sla) === JSON.stringify(sla)) return fail('Nothing was changed: these are already the targets.', 409);

    const now = new Date();
    await db.collection('settings').updateOne(
      { type: SUPPORT_SETTINGS_TYPE },
      { $set: { sla, updatedAt: now, updatedBy: check.admin.email || null }, $setOnInsert: { type: SUPPORT_SETTINGS_TYPE, createdAt: now } },
      { upsert: true }
    );
    // Only the priorities that changed are written to the log.
    const before: Record<string, any> = {};
    const after: Record<string, any> = {};
    for (const priority of Object.keys(sla)) {
      if (JSON.stringify(current.sla[priority]) !== JSON.stringify(sla[priority])) {
        before[priority] = current.sla[priority];
        after[priority] = sla[priority];
      }
    }
    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'support',
      entityType: 'support-settings',
      entityId: SUPPORT_SETTINGS_TYPE,
      entityLabel: 'Support SLA targets',
      before,
      after,
      reason,
      request,
    });
    return ok({ ...(await getSupportSettings(db)), message: 'SLA targets saved.' });
  } catch (error) {
    console.error('Save support settings failed:', error);
    return fail('Failed to save the SLA targets', 500);
  }
}
