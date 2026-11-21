import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { diff, logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import {
  DEFAULT_RISK_SETTINGS,
  RISK_SETTINGS_TYPE,
  RISK_SETTING_FIELDS,
  getRiskSettings,
  validateRiskSettings,
} from '@/lib/risk';

export const dynamic = 'force-dynamic';

/** Thresholds used by the risk detectors. */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'fraud:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const current = await getRiskSettings(db);
    return ok({
      settings: current.settings,
      defaults: DEFAULT_RISK_SETTINGS,
      fields: RISK_SETTING_FIELDS,
      updatedAt: current.updatedAt,
      updatedBy: current.updatedBy,
      canManage: can(check.admin, 'fraud:manage'),
    });
  } catch (error) {
    console.error('Reading risk settings failed:', error);
    return fail('Could not load the risk thresholds', 500);
  }
}

export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request, 'fraud:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const { values, error } = validateRiskSettings(body.settings);
    if (error) return fail(error);
    if (Object.keys(values).length === 0) return fail('No thresholds were sent');

    const { db } = await connectToDatabase();
    const before = (await getRiskSettings(db)).settings;
    const after = { ...before, ...values };
    const changes = diff(before, after);
    if (Object.keys(changes.after).length === 0) return ok({ settings: before, unchanged: true });

    const reason = asString(body.reason);
    await db.collection('settings').updateOne(
      { type: RISK_SETTINGS_TYPE },
      {
        $set: { ...after, type: RISK_SETTINGS_TYPE, updatedAt: new Date(), updatedBy: check.admin.email || null },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'fraud',
      entityType: 'risk-settings',
      entityId: RISK_SETTINGS_TYPE,
      entityLabel: 'Risk thresholds',
      before: changes.before,
      after: changes.after,
      reason: reason || null,
      request,
    });

    return ok({ settings: after });
  } catch (error) {
    console.error('Saving risk settings failed:', error);
    return fail('Could not save the risk thresholds', 500);
  }
}
