import type { Db } from 'mongodb';
import { SERVICES } from '@/lib/ledger';

/**
 * Commission statements, built from the ledger.
 *
 * Only successful entries count. Every figure is produced twice: once by a
 * database aggregation (the statement) and once by reading the raw entries one
 * by one and adding them up in paise (the check). The two must be equal.
 */

export const STATEMENT_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60000;

export interface Period {
  from: Date | null;
  to: Date | null;
  /** The days as the admin chose them, in India time. */
  fromDay: string | null;
  toDay: string | null;
  label: string;
}

/** A period of whole days in India time. Returns a message when a date is not valid. */
export function parsePeriod(fromText: string | null, toText: string | null): Period | string {
  const day = (text: string | null, endOfDay: boolean): Date | null | string => {
    if (!text) return null;
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return 'Dates must be given as YYYY-MM-DD';
    const utc = Date.UTC(+match[1], +match[2] - 1, +match[3], endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    const probe = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    if (probe.getUTCMonth() !== +match[2] - 1 || probe.getUTCDate() !== +match[3]) return `${text} is not a real date`;
    return new Date(utc - IST_OFFSET_MS);
  };
  const from = day(fromText, false);
  const to = day(toText, true);
  if (typeof from === 'string') return from;
  if (typeof to === 'string') return to;
  if (from && to && from.getTime() > to.getTime()) return 'The period start must be before its end';
  const label =
    from && to ? `${fromText} to ${toText}` : from ? `From ${fromText}` : to ? `Up to ${toText}` : 'All time';
  return { from, to, fromDay: from ? fromText : null, toDay: to ? toText : null, label };
}

export function istStamp(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ') + ' IST';
}

export interface Figures {
  payments: number;
  gross: number;
  commission: number;
  gstOnCommission: number;
  /** GST the customer paid on the sale itself (recorded invoices). */
  gstOnSales: number;
  gatewayFees: number;
  refunds: number;
  refundDeductions: number;
  /** Coupon discounts funded by the platform; owed to the payee on top of what the customer paid. */
  couponDiscounts: number;
  /** Paid out to payees in the period (settlement entries). */
  settled: number;
  /** Net owed to organisers, artists, instructors and cinemas for the period. */
  netPayable: number;
  /** Gross less refunds, before any charge. */
  netRevenue: number;
  entries: number;
}

const FIGURE_KEYS: (keyof Figures)[] = [
  'payments',
  'gross',
  'commission',
  'gstOnCommission',
  'gstOnSales',
  'gatewayFees',
  'refunds',
  'refundDeductions',
  'couponDiscounts',
  'settled',
  'netPayable',
  'netRevenue',
  'entries',
];

/** Working totals in paise, so no rounding error can build up. */
type Paise = Record<keyof Figures, number>;

function zero(): Paise {
  return Object.fromEntries(FIGURE_KEYS.map((k) => [k, 0])) as Paise;
}

function toPaise(amount: unknown): number {
  return Math.round((Number(amount) || 0) * 100);
}

function isOwedToPayee(payeeType: unknown, payeeId: unknown): boolean {
  return Boolean(payeeId) && payeeType !== 'platform' && payeeType !== null && payeeType !== undefined && payeeType !== '';
}

function add(total: Paise, entry: { type: string; paise: number; count: number; owed: boolean; saleGst: boolean }) {
  total.entries += entry.count;
  const owed = entry.owed ? entry.paise : 0;
  switch (entry.type) {
    case 'payment':
      total.payments += entry.count;
      total.gross += entry.paise;
      total.netRevenue += entry.paise;
      total.netPayable += owed;
      break;
    case 'commission':
      total.commission += entry.paise;
      total.netPayable -= owed;
      break;
    case 'gst':
      if (entry.saleGst) total.gstOnSales += entry.paise;
      else total.gstOnCommission += entry.paise;
      total.netPayable -= owed;
      break;
    case 'gateway_fee':
      total.gatewayFees += entry.paise;
      total.netPayable -= owed;
      break;
    case 'refund':
      total.refunds += entry.paise;
      total.netRevenue -= entry.paise;
      total.netPayable -= owed;
      break;
    case 'refund_deduction':
      // Kept by the platform under the refund rule, so not owed to the payee (as in payeeBalance).
      total.refundDeductions += entry.paise;
      total.netPayable -= owed;
      break;
    case 'coupon_discount':
      total.couponDiscounts += entry.paise;
      total.netPayable += owed;
      break;
    case 'settlement':
      total.settled += entry.paise;
      break;
    default:
      break;
  }
}

function rupees(total: Paise): Figures {
  const out = {} as Figures;
  for (const key of FIGURE_KEYS) out[key] = key === 'payments' || key === 'entries' ? total[key] : total[key] / 100;
  return out;
}

export function ledgerFilter(period: Period, service?: string | null): Record<string, any> {
  const filter: Record<string, any> = { status: 'success' };
  if (service) filter.service = service;
  if (period.from || period.to) {
    filter.createdAt = {};
    if (period.from) filter.createdAt.$gte = period.from;
    if (period.to) filter.createdAt.$lte = period.to;
  }
  return filter;
}

const SALE_GST = { $or: [{ $eq: ['$meta.gstKind', 'collected_on_sale'] }, { $regexMatch: { input: { $ifNull: ['$description', ''] }, regex: '^GST collected:' } }] };

export interface ServiceRow extends Figures {
  service: string;
  label: string;
}

export interface PayeeRow extends Figures {
  payeeType: string;
  payeeId: string;
  payeeName: string | null;
}

export interface Statement {
  services: ServiceRow[];
  payees: PayeeRow[];
  total: Figures;
  /** The same totals from the raw entries, added up one by one. */
  raw: Figures;
  matches: boolean;
  differences: { figure: string; statement: number; raw: number }[];
  /** Entries in the period that are not counted because they are not successful. */
  excluded: { status: string; count: number; amount: number }[];
  rawTruncated: boolean;
}

const RAW_LIMIT = 500_000;

export async function buildStatement(db: Db, period: Period, service?: string | null): Promise<Statement> {
  const transactions = db.collection('transactions');
  const filter = ledgerFilter(period, service);

  /* ---- 1. The statement: grouped by the database. ---- */
  const groups = await transactions
    .aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            service: '$service',
            type: {
              $cond: [
                { $and: [{ $eq: ['$type', 'adjustment'] }, { $eq: ['$meta.kind', 'coupon_discount'] }] },
                'coupon_discount',
                '$type',
              ],
            },
            payeeType: { $ifNull: ['$payeeType', null] },
            payeeId: { $ifNull: ['$payeeId', null] },
            saleGst: SALE_GST,
          },
          // Whole paise, so the sum is exact.
          paise: { $sum: { $round: [{ $multiply: ['$amount', 100] }, 0] } },
          count: { $sum: 1 },
          payeeName: { $max: '$payeeName' },
        },
      },
    ])
    .toArray();

  const byService = new Map<string, Paise>();
  const byPayee = new Map<string, { payeeType: string; payeeId: string; payeeName: string | null; total: Paise }>();
  const grand = zero();

  for (const group of groups) {
    const key = group._id;
    const owed = isOwedToPayee(key.payeeType, key.payeeId);
    const entry = { type: String(key.type), paise: Number(group.paise) || 0, count: Number(group.count) || 0, owed, saleGst: Boolean(key.saleGst) };

    const serviceKey = String(key.service || '');
    if (!byService.has(serviceKey)) byService.set(serviceKey, zero());
    add(byService.get(serviceKey)!, entry);
    add(grand, entry);

    if (owed) {
      const payeeKey = `${key.payeeType}:${key.payeeId}`;
      if (!byPayee.has(payeeKey)) {
        byPayee.set(payeeKey, { payeeType: String(key.payeeType), payeeId: String(key.payeeId), payeeName: null, total: zero() });
      }
      const row = byPayee.get(payeeKey)!;
      if (group.payeeName && !row.payeeName) row.payeeName = String(group.payeeName);
      add(row.total, entry);
    }
  }

  const known = SERVICES.map((s) => s.value as string);
  const serviceOrder = [...known, ...Array.from(byService.keys()).filter((k) => !known.includes(k))];
  const services: ServiceRow[] = serviceOrder
    .filter((value) => (service ? value === service : true))
    .map((value) => ({
      service: value,
      label: SERVICES.find((s) => s.value === value)?.label || value || 'No service recorded',
      ...rupees(byService.get(value) || zero()),
    }));

  const payees: PayeeRow[] = Array.from(byPayee.values())
    .map((row) => ({ payeeType: row.payeeType, payeeId: row.payeeId, payeeName: row.payeeName, ...rupees(row.total) }))
    .sort((a, b) => b.gross - a.gross || a.payeeId.localeCompare(b.payeeId));

  /* ---- 2. The check: every raw entry, read and added one by one. ---- */
  const rawTotal = zero();
  let read = 0;
  const cursor = transactions
    .find(filter, { projection: { type: 1, amount: 1, payeeType: 1, payeeId: 1, description: 1, 'meta.gstKind': 1, 'meta.kind': 1 } })
    .limit(RAW_LIMIT + 1);
  for await (const doc of cursor) {
    read++;
    if (read > RAW_LIMIT) break;
    add(rawTotal, {
      type: doc.type === 'adjustment' && doc.meta?.kind === 'coupon_discount' ? 'coupon_discount' : String(doc.type),
      paise: toPaise(doc.amount),
      count: 1,
      owed: isOwedToPayee(doc.payeeType, doc.payeeId),
      saleGst: doc.meta?.gstKind === 'collected_on_sale' || /^GST collected:/.test(String(doc.description || '')),
    });
  }

  const total = rupees(grand);
  const raw = rupees(rawTotal);
  const differences = FIGURE_KEYS.filter((key) => grand[key] !== rawTotal[key]).map((key) => ({
    figure: key,
    statement: total[key],
    raw: raw[key],
  }));

  /* ---- 3. What was left out, so nothing disappears silently. ---- */
  const { status: _status, ...withoutStatus } = filter;
  const excludedRows = await transactions
    .aggregate([
      { $match: { ...withoutStatus, status: { $ne: 'success' } } },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ])
    .toArray();

  return {
    services,
    payees,
    total,
    raw,
    matches: differences.length === 0 && read <= RAW_LIMIT,
    differences,
    excluded: excludedRows.map((r) => ({ status: String(r._id), count: r.count, amount: Math.round((r.amount || 0) * 100) / 100 })),
    rawTruncated: read > RAW_LIMIT,
  };
}
