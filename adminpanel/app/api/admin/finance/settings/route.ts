import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp, requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { SERVICES } from '@/lib/ledger';
import { approvalHeldResponse, gateSensitiveAction } from '@/lib/approvals';
import {
  FINANCE_SETTING_KEYS,
  GSTIN_PATTERN,
  GST_TREATMENT_TEXT,
  PAYOUT_SCHEDULES,
  SERVICE_RULE_KEYS,
  emptyServiceRule,
  getFinanceSettings,
  isEmptyServiceRule,
  settlementRuleFor,
  refundApprovalLimit,
  type ServiceRule,
} from './store';

export const dynamic = 'force-dynamic';

/**
 * Approval thresholds, payout schedule, settlement eligibility (global and
 * per service) and the platform's GST registration.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const settings = await getFinanceSettings(db);
    const history = await db
      .collection('auditLogs')
      .find({ entityType: 'finance-settings' })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();

    return ok({
      settings,
      gstTreatmentText: GST_TREATMENT_TEXT,
      // What applies to each service once the fall-back to the global value is taken into account.
      effective: SERVICES.map((s) => ({
        service: s.value,
        label: s.label,
        refundApproval: refundApprovalLimit(settings, s.value),
        settlement: settlementRuleFor(settings, s.value),
      })),
      history: history.map((h) => ({ ...h, _id: String(h._id) })),
      canManage: can(check.admin, 'finance:manage'),
    });
  } catch (error) {
    console.error('Load finance settings failed:', error);
    return fail('Failed to load the finance settings', 500);
  }
}

/** Reads an optional non-negative number. Returns [value, error]. */
function amount(value: unknown, label: string, wholeNumber = false): [number | null, string | null] {
  if (value === null || value === undefined || value === '') return [null, null];
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return [null, `${label} must be a number, 0 or more`];
  if (wholeNumber && !Number.isInteger(parsed)) return [null, `${label} must be a whole number`];
  if (parsed > 1_000_000_000) return [null, `${label} is too large`];
  return [parsed, null];
}

function schedule(value: unknown): [string | null, string | null] {
  if (value === null || value === undefined || value === '') return [null, null];
  const text = asString(value, 20);
  if (!(PAYOUT_SCHEDULES as readonly string[]).includes(text)) return [null, 'Unknown payout schedule'];
  return [text, null];
}

/**
 * PUT { reason, ...values }
 *
 * A key that is absent keeps its current value; an empty value clears it.
 * `serviceRules` is { <service>: { refundSecondApprovalAbove, payoutSchedule,
 * settlementEligibilityDays } }: a service that is sent replaces that
 * service's values, a service that is not sent is left alone.
 */
export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid request body');

    const reason = asString(body.reason);
    if (reason.length < 5) return fail('A written reason is required to change the finance settings');

    const { db } = await connectToDatabase();
    const current = await getFinanceSettings(db);
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    const next: Record<string, any> = {};
    for (const key of FINANCE_SETTING_KEYS) next[key] = (current as any)[key];

    if (has('refundSecondApprovalAbove')) {
      const [value, error] = amount(body.refundSecondApprovalAbove, 'The refund approval threshold');
      if (error) return fail(error);
      next.refundSecondApprovalAbove = value;
    }
    if (has('payoutSecondApprovalAbove')) {
      const [value, error] = amount(body.payoutSecondApprovalAbove, 'The payout approval threshold');
      if (error) return fail(error);
      next.payoutSecondApprovalAbove = value;
    }
    if (has('settlementEligibilityDays')) {
      const [value, error] = amount(body.settlementEligibilityDays, 'Settlement eligibility days', true);
      if (error) return fail(error);
      next.settlementEligibilityDays = value;
    }
    if (has('payoutSchedule')) {
      const [value, error] = schedule(body.payoutSchedule);
      if (error) return fail(error);
      next.payoutSchedule = value;
    }
    if (has('gstNumber')) {
      const gstNumber = asString(body.gstNumber, 20).toUpperCase().replace(/\s+/g, '');
      if (gstNumber && !GSTIN_PATTERN.test(gstNumber)) {
        return fail('The GST number is not a valid GSTIN. It has 15 characters, for example 24ABCDE1234F1Z5.');
      }
      next.gstNumber = gstNumber || null;
    }
    if (has('gstLegalName')) next.gstLegalName = asString(body.gstLegalName, 200) || null;

    // Per-service values.
    const serviceRules: Record<string, ServiceRule> = { ...current.serviceRules };
    if (has('serviceRules')) {
      const input = body.serviceRules;
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('The per-service rules are not valid');
      for (const [service, raw] of Object.entries(input as Record<string, any>)) {
        const known = SERVICES.find((s) => s.value === service);
        if (!known) return fail('Unknown service in the per-service rules');
        if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) return fail(`The rules for ${known.label} are not valid`);
        const rule = emptyServiceRule();
        if (raw) {
          const [refundAbove, e1] = amount(raw.refundSecondApprovalAbove, `The refund approval threshold for ${known.label}`);
          const [days, e2] = amount(raw.settlementEligibilityDays, `Settlement eligibility days for ${known.label}`, true);
          const [cycle, e3] = schedule(raw.payoutSchedule);
          const firstError = e1 || e2 || (e3 ? `${e3} for ${known.label}` : null);
          if (firstError) return fail(firstError);
          rule.refundSecondApprovalAbove = refundAbove;
          rule.settlementEligibilityDays = days;
          rule.payoutSchedule = cycle as ServiceRule['payoutSchedule'];
        }
        if (isEmptyServiceRule(rule)) delete serviceRules[service];
        else serviceRules[service] = rule;
      }
    }

    // Old and new value of everything that changed, one line per value.
    const before: Record<string, any> = {};
    const after: Record<string, any> = {};
    for (const key of FINANCE_SETTING_KEYS) {
      if ((current as any)[key] !== next[key]) {
        before[key] = (current as any)[key];
        after[key] = next[key];
      }
    }
    for (const service of SERVICES) {
      const was = current.serviceRules[service.value] || emptyServiceRule();
      const now = serviceRules[service.value] || emptyServiceRule();
      for (const key of SERVICE_RULE_KEYS) {
        if (was[key] !== now[key]) {
          before[`${service.value}.${key}`] = was[key];
          after[`${service.value}.${key}`] = now[key];
        }
      }
    }
    if (Object.keys(after).length === 0) return ok({ settings: current, unchanged: true });

    // A second approver, when the security settings ask for one ("finance_settings").
    const { approvalId: _ignored, ...replayBody } = body as Record<string, any>;
    const gate = await gateSensitiveAction(db, {
      action: 'finance_settings',
      admin: check.admin,
      entityType: 'finance-settings',
      entityId: 'finance',
      entityLabel: 'Finance settings',
      before,
      after,
      payload: { ...next, serviceRules },
      reason,
      approvalId: asString(body.approvalId, 40) || null,
      replay: { method: 'PUT', path: '/api/admin/finance/settings', body: replayBody },
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    });
    if (!gate.proceed) return approvalHeldResponse(gate);

    const now = new Date();
    await db.collection('settings').updateOne(
      { type: 'finance' },
      {
        $set: { ...next, serviceRules, updatedAt: now, updatedBy: check.admin.email || null },
        $setOnInsert: { type: 'finance', createdAt: now },
      },
      { upsert: true }
    );

    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'finance',
      entityType: 'finance-settings',
      entityId: 'finance',
      entityLabel: 'Finance settings',
      // The new values are used by the next refund approval and the next settlement created.
      before,
      after: { ...after, changeAppliesFrom: now },
      reason,
      meta: gate.approval ? { approvalId: String(gate.approval._id), requestedBy: gate.approval.requestedBy, approvedBy: gate.approval.decidedBy } : undefined,
      request,
    });

    return ok({ settings: await getFinanceSettings(db) });
  } catch (error) {
    console.error('Save finance settings failed:', error);
    return fail('Failed to save the finance settings', 500);
  }
}
