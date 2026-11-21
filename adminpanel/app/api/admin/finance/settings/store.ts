import type { Db } from 'mongodb';
import { SERVICES } from '@/lib/ledger';

/**
 * Finance settings: one document in `settings` with type 'finance'.
 * Every value is null until an admin sets it. Nothing is assumed.
 *
 * The approval thresholds, payout schedule and settlement eligibility have a
 * global value and may be overridden for a single service in `serviceRules`.
 * A service value that is not set falls back to the global one.
 */

export const PAYOUT_SCHEDULES = ['weekly', 'fortnightly', 'monthly', 'manual'] as const;
export type PayoutSchedule = (typeof PAYOUT_SCHEDULES)[number];

export interface ServiceRule {
  /** A refund for this service above this amount needs a second approver. */
  refundSecondApprovalAbove: number | null;
  payoutSchedule: PayoutSchedule | null;
  /** Days after the event before this service's earnings can be settled. */
  settlementEligibilityDays: number | null;
}

/**
 * How GST is charged today, as computed by `computeCharges` in lib/ledger.ts:
 * on the platform's commission only, added on top of the commission.
 */
export const GST_TREATMENT = 'exclusive' as const;
export const GST_TREATMENT_TEXT =
  'GST is charged on the platform commission only, in addition to the commission (exclusive). No GST is charged on the ticket or service price.';

export interface FinanceSettings {
  /** A refund above this amount needs a second, different approver. */
  refundSecondApprovalAbove: number | null;
  /** A payout above this amount needs a second, different approver. */
  payoutSecondApprovalAbove: number | null;
  payoutSchedule: PayoutSchedule | null;
  /** Days after the event before its earnings can be settled. */
  settlementEligibilityDays: number | null;
  /** The platform's GST registration number (GSTIN), printed on statements. */
  gstNumber: string | null;
  /** The registered name the GSTIN belongs to. */
  gstLegalName: string | null;
  gstTreatment: typeof GST_TREATMENT;
  /** Per-service values; a missing or null value falls back to the global one. */
  serviceRules: Record<string, ServiceRule>;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export const FINANCE_SETTING_KEYS = [
  'refundSecondApprovalAbove',
  'payoutSecondApprovalAbove',
  'payoutSchedule',
  'settlementEligibilityDays',
  'gstNumber',
  'gstLegalName',
] as const;

export const SERVICE_RULE_KEYS = ['refundSecondApprovalAbove', 'payoutSchedule', 'settlementEligibilityDays'] as const;

/** 15 characters: 2-digit state code, 10-character PAN, entity number, "Z", check character. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function numberOrNull(value: any): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function scheduleOrNull(value: any): PayoutSchedule | null {
  return (PAYOUT_SCHEDULES as readonly string[]).includes(value) ? (value as PayoutSchedule) : null;
}

export function emptyServiceRule(): ServiceRule {
  return { refundSecondApprovalAbove: null, payoutSchedule: null, settlementEligibilityDays: null };
}

export function isEmptyServiceRule(rule: ServiceRule): boolean {
  return rule.refundSecondApprovalAbove === null && rule.payoutSchedule === null && rule.settlementEligibilityDays === null;
}

export async function getFinanceSettings(db: Db): Promise<FinanceSettings> {
  const doc = await db.collection('settings').findOne({ type: 'finance' });

  const serviceRules: Record<string, ServiceRule> = {};
  const stored = doc?.serviceRules && typeof doc.serviceRules === 'object' ? doc.serviceRules : {};
  for (const service of SERVICES) {
    const raw = stored[service.value];
    if (!raw || typeof raw !== 'object') continue;
    const rule: ServiceRule = {
      refundSecondApprovalAbove: numberOrNull(raw.refundSecondApprovalAbove),
      payoutSchedule: scheduleOrNull(raw.payoutSchedule),
      settlementEligibilityDays: numberOrNull(raw.settlementEligibilityDays),
    };
    if (!isEmptyServiceRule(rule)) serviceRules[service.value] = rule;
  }

  return {
    refundSecondApprovalAbove: numberOrNull(doc?.refundSecondApprovalAbove),
    payoutSecondApprovalAbove: numberOrNull(doc?.payoutSecondApprovalAbove),
    payoutSchedule: scheduleOrNull(doc?.payoutSchedule),
    settlementEligibilityDays: numberOrNull(doc?.settlementEligibilityDays),
    gstNumber: typeof doc?.gstNumber === 'string' && doc.gstNumber ? doc.gstNumber : null,
    gstLegalName: typeof doc?.gstLegalName === 'string' && doc.gstLegalName ? doc.gstLegalName : null,
    gstTreatment: GST_TREATMENT,
    serviceRules,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
  };
}

export type RuleSource = 'service' | 'global' | 'none';

/** The amount above which a refund for this service needs a second approver. */
export function refundApprovalLimit(settings: FinanceSettings, service: string | null | undefined): { amount: number | null; source: RuleSource } {
  const own = service ? settings.serviceRules[service]?.refundSecondApprovalAbove : null;
  if (own !== null && own !== undefined) return { amount: own, source: 'service' };
  if (settings.refundSecondApprovalAbove !== null) return { amount: settings.refundSecondApprovalAbove, source: 'global' };
  return { amount: null, source: 'none' };
}

export interface SettlementRule {
  service: string;
  payoutSchedule: PayoutSchedule | null;
  scheduleSource: RuleSource;
  eligibilityDays: number | null;
  eligibilitySource: RuleSource;
}

/** The payout schedule and settlement eligibility wait that apply to one service. */
export function settlementRuleFor(settings: FinanceSettings, service: string): SettlementRule {
  const own = settings.serviceRules[service];
  const schedule = own?.payoutSchedule ?? null;
  const days = own?.settlementEligibilityDays ?? null;
  return {
    service,
    payoutSchedule: schedule ?? settings.payoutSchedule,
    scheduleSource: schedule !== null ? 'service' : settings.payoutSchedule !== null ? 'global' : 'none',
    eligibilityDays: days ?? settings.settlementEligibilityDays,
    eligibilitySource: days !== null ? 'service' : settings.settlementEligibilityDays !== null ? 'global' : 'none',
  };
}

/** The date a payout for a period is due: the period end plus one payout cycle. */
export function dueDateFor(periodTo: Date, schedule: PayoutSchedule | null): Date | null {
  if (!schedule || schedule === 'manual') return null;
  const due = new Date(periodTo);
  if (schedule === 'weekly') due.setDate(due.getDate() + 7);
  else if (schedule === 'fortnightly') due.setDate(due.getDate() + 14);
  else due.setMonth(due.getMonth() + 1);
  return due;
}
