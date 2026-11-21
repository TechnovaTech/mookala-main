import type { Db } from 'mongodb';
import { roundMoney, type Service } from '@/lib/ledger';
import { toObjectId } from '@/lib/http';

export const SETTLEMENT_STATUSES = ['pending', 'awaiting_second_approval', 'approved', 'paid', 'failed', 'on_hold'] as const;

/** A settlement in one of these states has claimed money that is not paid out yet. */
export const OPEN_STATUSES = ['pending', 'awaiting_second_approval', 'approved', 'on_hold'];

export const PAYEE_TYPES = ['organizer', 'artist', 'instructor', 'cinema', 'advertiser'] as const;

/** Ledger entry types that change what a payee is owed. */
const EARNING_TYPES = ['payment', 'commission', 'gst', 'gateway_fee', 'refund'];

export function serialiseDoc<T extends Record<string, any>>(doc: T): T {
  return { ...doc, _id: String(doc._id) };
}

export interface PeriodTotals {
  grossAmount: number;
  commissionAmount: number;
  gstAmount: number;
  gatewayFeeAmount: number;
  refundsAmount: number;
  netAmount: number;
}

export function totalsOf(entries: any[]): PeriodTotals {
  const sum = (type: string) => entries.filter((e) => e.type === type).reduce((total, e) => total + (Number(e.amount) || 0), 0);
  const gross = sum('payment');
  const commission = sum('commission');
  const gst = sum('gst');
  const gatewayFee = sum('gateway_fee');
  const refunds = sum('refund');
  return {
    grossAmount: roundMoney(gross),
    commissionAmount: roundMoney(commission),
    gstAmount: roundMoney(gst),
    gatewayFeeAmount: roundMoney(gatewayFee),
    refundsAmount: roundMoney(refunds),
    netAmount: roundMoney(gross - commission - gst - gatewayFee - refunds),
  };
}

/** Net amount of the payee's settlements that are created but not yet paid. */
export async function openSettlementTotal(db: Db, payeeType: string, payeeId: string, excludeId?: any): Promise<number> {
  const rows = await db
    .collection('settlements')
    .find(
      { payeeType, payeeId, status: { $in: OPEN_STATUSES }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) },
      { projection: { netAmount: 1 } }
    )
    .toArray();
  return roundMoney(rows.reduce((total, r) => total + (Number(r.netAmount) || 0), 0));
}

/**
 * The ledger entries a new settlement for this payee and period would cover:
 * successful entries dated inside the period that no other settlement (other
 * than a failed one) already covers, less the entries of events that are still
 * inside the settlement eligibility wait.
 */
export async function collectPeriodEntries(
  db: Db,
  input: {
    payeeType: string;
    payeeId: string;
    from: Date;
    to: Date;
    service: Service | null;
    /** Days after the event before an entry of this service can be settled; null for no wait. */
    eligibilityDaysFor: (service: string) => number | null;
  }
) {
  const filter: Record<string, any> = {
    payeeType: input.payeeType,
    payeeId: input.payeeId,
    status: 'success',
    type: { $in: EARNING_TYPES },
    createdAt: { $gte: input.from, $lte: input.to },
  };
  if (input.service) filter.service = input.service;

  const [all, earlier] = await Promise.all([
    db.collection('transactions').find(filter).sort({ createdAt: 1 }).limit(20000).toArray(),
    db
      .collection('settlements')
      .find({ payeeType: input.payeeType, payeeId: input.payeeId, status: { $ne: 'failed' } }, { projection: { entryReferences: 1 } })
      .toArray(),
  ]);

  const covered = new Set<string>();
  for (const settlement of earlier) for (const ref of settlement.entryReferences || []) covered.add(String(ref));

  const uncovered = all.filter((e) => !covered.has(String(e.reference)));
  const alreadySettled = all.length - uncovered.length;

  let entries = uncovered;
  let heldBack: any[] = [];

  // The wait depends on the service of each entry: a service may have its own
  // settlement rule, otherwise the global one applies.
  const waitOf = new Map<string, number | null>();
  for (const entry of uncovered) {
    const service = String(entry.service || '');
    if (!waitOf.has(service)) waitOf.set(service, input.eligibilityDaysFor(service));
  }

  if (Array.from(waitOf.values()).some((days) => days !== null)) {
    const eventIds = Array.from(new Set(uncovered.map((e) => (e.eventId ? String(e.eventId) : '')).filter(Boolean)));
    const objectIds = eventIds.map((id) => toObjectId(id)).filter(Boolean) as any[];
    const events = objectIds.length
      ? await db
          .collection('events')
          .find({ _id: { $in: objectIds } }, { projection: { startDate: 1, endDate: 1 } })
          .toArray()
      : [];
    const endOf = new Map<string, Date | null>();
    for (const event of events) {
      const end = new Date(event.endDate || event.startDate || '');
      endOf.set(String(event._id), Number.isNaN(end.getTime()) ? null : end);
    }

    const now = Date.now();
    const isHeld = (entry: any) => {
      const days = waitOf.get(String(entry.service || '')) ?? null;
      if (days === null || !entry.eventId) return false;
      const end = endOf.get(String(entry.eventId));
      // An event whose date cannot be read is held back rather than paid early.
      return !end || end.getTime() + days * 86_400_000 > now;
    };

    entries = uncovered.filter((e) => !isHeld(e));
    heldBack = uncovered.filter(isHeld);
  }

  return {
    entries,
    totals: totalsOf(entries),
    alreadySettled,
    heldBackCount: heldBack.length,
    heldBackNet: totalsOf(heldBack).netAmount,
    heldBackServices: Array.from(new Set(heldBack.map((e) => String(e.service || '')))),
  };
}

/** The payee's display name: from the ledger, or from the organiser / artist record. */
export async function payeeNameOf(db: Db, payeeType: string, payeeId: string, fallback?: string | null): Promise<string | null> {
  if (fallback) return fallback;
  const oid = toObjectId(payeeId);
  if (!oid) return null;
  const collection =
    payeeType === 'organizer'
      ? 'organizers'
      : payeeType === 'artist'
      ? 'artists'
      : payeeType === 'instructor'
      ? 'instructors'
      : payeeType === 'cinema'
      ? 'cinemas'
      : null;
  if (!collection) return null;
  const doc = await db.collection(collection).findOne({ _id: oid }, { projection: { name: 1, cinemaName: 1 } });
  const name = doc?.name || doc?.cinemaName;
  return name ? String(name) : null;
}
