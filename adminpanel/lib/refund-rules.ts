import type { Db } from 'mongodb';
import { roundMoney, type Service } from './ledger';

/**
 * Cancellation and refund rules (requirements section 11).
 *
 * A rule in the `refundRules` collection says: for this service, when the
 * customer cancels at least `minHoursBefore` hours before the event (and, if
 * `maxHoursBefore` is set, no more than that many hours before), refund
 * `refundPercent` of what was paid, less `deductionFlat` rupees.
 *
 *   { service, name, minHoursBefore, maxHoursBefore, refundPercent,
 *     deductionFlat, status: 'active' | 'draft' | 'retired' }
 *
 * When several active rules match, the one with the highest `minHoursBefore`
 * wins, so "more than 72 hours" is preferred over "more than 24 hours". When
 * none matches, no refund is offered: nothing is assumed. `describePolicy`
 * turns the active rules into the non-overlapping windows a customer is shown.
 */
export interface RefundRule {
  _id?: any;
  service: Service;
  name: string;
  minHoursBefore: number;
  maxHoursBefore?: number | null;
  refundPercent: number;
  deductionFlat?: number | null;
  status: string;
}

export interface RefundQuote {
  eligible: boolean;
  ruleId: string | null;
  ruleName: string | null;
  refundPercent: number;
  /** What the platform keeps: the unrefunded share plus the flat deduction. */
  deductionAmount: number;
  refundAmount: number;
  /** Shown to the customer before they confirm. */
  explanation: string;
  ruleSnapshot: Record<string, any> | null;
}

/**
 * Active rules in the order they are tried: highest `minHoursBefore` first.
 * Two active rules of one service never share the same `minHoursBefore` (the
 * rules screen refuses it), so this order is the same everywhere it is used:
 * the calculator, a real cancellation and the policy published to customers.
 * The remaining keys only make the order fixed for data that predates that check.
 */
export function orderRules<T extends Partial<RefundRule>>(rules: T[]): T[] {
  const max = (rule: T) => (rule.maxHoursBefore == null ? Infinity : Number(rule.maxHoursBefore));
  return [...rules].sort(
    (a, b) =>
      (Number(b.minHoursBefore) || 0) - (Number(a.minHoursBefore) || 0) ||
      max(a) - max(b) ||
      String(a._id ?? '').localeCompare(String(b._id ?? ''))
  );
}

function matches(rule: Partial<RefundRule>, hoursBeforeEvent: number): boolean {
  const min = Number(rule.minHoursBefore) || 0;
  const max = rule.maxHoursBefore == null ? null : Number(rule.maxHoursBefore);
  return hoursBeforeEvent >= min && (max === null || hoursBeforeEvent <= max);
}

/** The first rule, in `orderRules` order, whose window contains the given hours. */
export function pickRule<T extends Partial<RefundRule>>(rules: T[], hoursBeforeEvent: number): T | null {
  for (const rule of orderRules(rules)) if (matches(rule, hoursBeforeEvent)) return rule;
  return null;
}

export async function findRefundRule(db: Db, service: Service, hoursBeforeEvent: number): Promise<RefundRule | null> {
  const rules = (await db
    .collection('refundRules')
    .find({ service, status: 'active' })
    .sort({ minHoursBefore: -1 })
    .toArray()) as unknown as RefundRule[];
  return pickRule(rules, hoursBeforeEvent);
}

export interface PolicyWindow {
  /** Hours before the event, inclusive. */
  fromHours: number;
  /** Exclusive upper end; null for "or more". */
  toHours: number | null;
  rule: { id: string; name: string; refundPercent: number; deductionFlat: number } | null;
}

export interface RuleOverlap {
  winner: string;
  loser: string;
  fromHours: number;
  toHours: number | null;
  /** True when the two rules start at the same hours, so nothing decides between them. */
  ambiguous: boolean;
}

/**
 * What a set of active rules means for every possible cancellation time:
 * non-overlapping windows with the rule that wins in each, and the pairs of
 * rules whose windows overlap. Uses `pickRule`, so it cannot disagree with a
 * real cancellation.
 */
export function describePolicy(rules: Partial<RefundRule>[]): { windows: PolicyWindow[]; overlaps: RuleOverlap[] } {
  const ordered = orderRules(rules);
  const edges = new Set<number>([0]);
  for (const rule of ordered) {
    edges.add(Number(rule.minHoursBefore) || 0);
    // A rule covers its upper limit itself, so the next window starts just after it.
    if (rule.maxHoursBefore != null) edges.add(Number(rule.maxHoursBefore));
  }
  const points = Array.from(edges).sort((a, b) => a - b);

  const windows: PolicyWindow[] = [];
  const add = (fromHours: number, toHours: number | null, sample: number) => {
    const rule = pickRule(ordered, sample);
    const entry = rule
      ? {
          id: String(rule._id ?? ''),
          name: String(rule.name ?? ''),
          refundPercent: Math.min(100, Math.max(0, Number(rule.refundPercent) || 0)),
          deductionFlat: Math.max(0, Number(rule.deductionFlat) || 0),
        }
      : null;
    const last = windows[windows.length - 1];
    if (last && (last.rule?.id ?? null) === (entry?.id ?? null)) last.toHours = toHours;
    else windows.push({ fromHours, toHours, rule: entry });
  };
  for (let i = 0; i < points.length; i++) {
    const from = points[i];
    const to = i + 1 < points.length ? points[i + 1] : null;
    add(from, to, to === null ? from + 1 : (from + to) / 2);
  }

  const overlaps: RuleOverlap[] = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i];
      const b = ordered[j];
      const from = Math.max(Number(a.minHoursBefore) || 0, Number(b.minHoursBefore) || 0);
      const aMax = a.maxHoursBefore == null ? Infinity : Number(a.maxHoursBefore);
      const bMax = b.maxHoursBefore == null ? Infinity : Number(b.maxHoursBefore);
      const to = Math.min(aMax, bMax);
      const sameStart = (Number(a.minHoursBefore) || 0) === (Number(b.minHoursBefore) || 0);
      // Windows that only touch at one point (24-72 and 72 or more) are not an overlap.
      if (to > from || (sameStart && to >= from)) {
        overlaps.push({
          winner: String(a.name ?? ''),
          loser: String(b.name ?? ''),
          fromHours: from,
          toHours: to === Infinity ? null : to,
          ambiguous: sameStart,
        });
      }
    }
  }

  return { windows, overlaps };
}

export function quoteRefund(amountPaid: number, rule: RefundRule | null): RefundQuote {
  if (!rule) {
    return {
      eligible: false,
      ruleId: null,
      ruleName: null,
      refundPercent: 0,
      deductionAmount: roundMoney(amountPaid),
      refundAmount: 0,
      explanation: 'No refund is available for a cancellation at this time.',
      ruleSnapshot: null,
    };
  }

  const percent = Math.min(100, Math.max(0, Number(rule.refundPercent) || 0));
  const flat = Math.max(0, Number(rule.deductionFlat) || 0);
  const refundAmount = roundMoney(Math.max(0, (amountPaid * percent) / 100 - flat));

  return {
    eligible: refundAmount > 0,
    ruleId: rule._id ? String(rule._id) : null,
    ruleName: rule.name,
    refundPercent: percent,
    deductionAmount: roundMoney(amountPaid - refundAmount),
    refundAmount,
    explanation:
      refundAmount > 0
        ? `${percent}% of the amount paid is refunded` + (flat > 0 ? `, less a ₹${flat} cancellation charge.` : '.')
        : 'No refund is available for a cancellation at this time.',
    ruleSnapshot: {
      name: rule.name,
      minHoursBefore: rule.minHoursBefore,
      maxHoursBefore: rule.maxHoursBefore ?? null,
      refundPercent: percent,
      deductionFlat: flat,
    },
  };
}
