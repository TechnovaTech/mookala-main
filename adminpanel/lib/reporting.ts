import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { COUPON_DISCOUNT_KIND, SERVICES, roundMoney, syncCouponDiscounts } from './ledger';
import { FIGURE_DEFINITIONS, REPORT_TIMEZONE, REPORT_TIMEZONE_LABEL, getReportInfo } from './resources/reports';

/**
 * Shared aggregation helpers for the finance screens and the reports.
 *
 * Every figure is computed in MongoDB from the `transactions` ledger (see
 * lib/ledger.ts) with the definitions in lib/resources/reports.ts, so the
 * overview, the reports and the exports always agree with each other and with
 * the entries they were built from. Nothing here estimates or fills in values.
 */

/* ------------------------------------------------------------------ */
/* Indexes                                                             */
/* ------------------------------------------------------------------ */

const INDEXES: [string, Record<string, 1 | -1>][] = [
  ['transactions', { type: 1, status: 1, createdAt: -1 }],
  ['transactions', { createdAt: -1 }],
  ['transactions', { gatewayPaymentId: 1 }],
  ['transactions', { payeeType: 1, payeeId: 1 }],
  ['transactions', { reference: 1 }],
  ['transactions', { parentReference: 1 }],
  ['webhookEvents', { receivedAt: -1 }],
  ['bookings', { createdAt: -1 }],
  ['bookings', { userPhone: 1, createdAt: 1 }],
  ['bookings', { paymentStatus: 1 }],
  ['users', { createdAt: -1 }],
  ['refunds', { createdAt: -1 }],
  ['settlements', { status: 1 }],
];

const globalForIndexes = global as unknown as { _reportingIndexes?: Promise<void> };

/** Creates the indexes the reports rely on. Runs once per process and is safe to repeat. */
export function ensureIndexes(db: Db): Promise<void> {
  if (!globalForIndexes._reportingIndexes) {
    globalForIndexes._reportingIndexes = (async () => {
      for (const [collection, keys] of INDEXES) {
        try {
          await db.collection(collection).createIndex(keys);
        } catch (error) {
          console.error(`Could not create index on ${collection}:`, error);
        }
      }
    })();
  }
  return globalForIndexes._reportingIndexes;
}

/* ------------------------------------------------------------------ */
/* Dates (all ranges are whole days in Asia/Kolkata)                   */
/* ------------------------------------------------------------------ */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day in IST for a moment in time, as YYYY-MM-DD. */
export function istDay(date: Date = new Date()): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2026-11-21 14:05:09" in IST. */
export function istDateTime(value: any): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

export function startOfIstDay(day: string): Date {
  return new Date(day + 'T00:00:00+05:30');
}

export function addDays(day: string, count: number): string {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function isDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export interface DateRange {
  preset: string;
  /** First and last day included, YYYY-MM-DD in IST. */
  from: string;
  to: string;
  /** `start` is inclusive, `end` is exclusive. */
  start: Date;
  end: Date;
  days: number;
  label: string;
}

export const RANGE_PRESETS = ['today', '7d', 'month', 'year', 'custom'] as const;
const MAX_RANGE_DAYS = 3660;

export function makeRange(from: string, to: string, preset = 'custom'): DateRange {
  const start = startOfIstDay(from);
  const end = startOfIstDay(addDays(to, 1));
  return {
    preset,
    from,
    to,
    start,
    end,
    days: Math.round((end.getTime() - start.getTime()) / 86_400_000),
    label: `${from} to ${to}`,
  };
}

/**
 * Reads `preset`, `from` and `to` from the query string. Returns an error
 * message (a string) when the dates are not usable.
 */
export function resolveRange(params: URLSearchParams, defaultPreset = 'month'): DateRange | string {
  const from = (params.get('from') || '').trim();
  const to = (params.get('to') || '').trim();
  let preset = (params.get('preset') || '').trim();
  if (!preset) preset = from || to ? 'custom' : defaultPreset;

  const today = istDay();
  switch (preset) {
    case 'today':
      return makeRange(today, today, preset);
    case '7d':
      return makeRange(addDays(today, -6), today, preset);
    case 'month':
      return makeRange(today.slice(0, 8) + '01', today, preset);
    case 'year':
      return makeRange(today.slice(0, 4) + '-01-01', today, preset);
    case 'custom': {
      if (!from || !to) return 'Choose both a start date and an end date.';
      if (!isDay(from) || !isDay(to)) return 'Dates must be valid and in the form YYYY-MM-DD.';
      if (from > to) return 'The start date must not be after the end date.';
      const range = makeRange(from, to, preset);
      if (range.days > MAX_RANGE_DAYS) return 'The date range is too long. Choose ten years or less.';
      return range;
    }
    default:
      return 'Unknown date range.';
  }
}

/**
 * Optional `from` / `to` filter for the list screens. Returns null when neither
 * is given, a Mongo condition for `createdAt` otherwise, or an error message.
 */
export function optionalCreatedAt(
  params: URLSearchParams
): { condition: Record<string, Date> | null; label: string } | string {
  const from = (params.get('from') || '').trim();
  const to = (params.get('to') || '').trim();
  if (!from && !to) return { condition: null, label: 'All dates' };
  if ((from && !isDay(from)) || (to && !isDay(to))) return 'Dates must be valid and in the form YYYY-MM-DD.';
  if (from && to && from > to) return 'The start date must not be after the end date.';
  const condition: Record<string, Date> = {};
  if (from) condition.$gte = startOfIstDay(from);
  if (to) condition.$lt = startOfIstDay(addDays(to, 1));
  return { condition, label: from && to ? `${from} to ${to}` : from ? `From ${from}` : `Up to ${to}` };
}

/** The last completed period for a schedule frequency. */
export function lastCompletedPeriod(frequency: string, now: Date = new Date()): DateRange {
  const today = istDay(now);
  if (frequency === 'daily') {
    const day = addDays(today, -1);
    return makeRange(day, day, 'custom');
  }
  if (frequency === 'weekly') {
    // Monday to Sunday of the week before the current one.
    const weekday = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
    const thisMonday = addDays(today, -weekday);
    return makeRange(addDays(thisMonday, -7), addDays(thisMonday, -1), 'custom');
  }
  const firstOfThisMonth = today.slice(0, 8) + '01';
  const lastOfPrevious = addDays(firstOfThisMonth, -1);
  return makeRange(lastOfPrevious.slice(0, 8) + '01', lastOfPrevious, 'custom');
}

/** When the period now in progress completes, i.e. when the next run falls due. */
export function nextRunDue(frequency: string, now: Date = new Date()): Date {
  const today = istDay(now);
  if (frequency === 'daily') return startOfIstDay(addDays(today, 1));
  if (frequency === 'weekly') {
    const weekday = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
    return startOfIstDay(addDays(today, 7 - weekday));
  }
  const date = new Date(today.slice(0, 8) + '01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + 1);
  return startOfIstDay(date.toISOString().slice(0, 10));
}

/* ------------------------------------------------------------------ */
/* Ledger aggregation                                                  */
/* ------------------------------------------------------------------ */

export type Bucket = 'day' | 'month' | 'year';

const BUCKET_FORMAT: Record<Bucket, string> = { day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' };

export interface LedgerGroup {
  type: string;
  status: string;
  service: string | null;
  bucket: string | null;
  total: number;
  count: number;
}

/**
 * Sums ledger entries by type and status, and optionally by service and by
 * day / month / year in IST. All grouping happens in MongoDB.
 */
export async function groupLedger(
  db: Db,
  match: Record<string, any>,
  options: { byService?: boolean; bucket?: Bucket } = {}
): Promise<LedgerGroup[]> {
  // Coupon discounts are 'adjustment' entries marked meta.kind 'coupon_discount'.
  // They are grouped as their own line so the figures can treat them apart.
  const id: Record<string, any> = {
    type: {
      $cond: [
        { $and: [{ $eq: ['$type', 'adjustment'] }, { $eq: ['$meta.kind', COUPON_DISCOUNT_KIND] }] },
        COUPON_DISCOUNT_KIND,
        '$type',
      ],
    },
    status: '$status',
  };
  if (options.byService) id.service = '$service';
  if (options.bucket) {
    id.bucket = { $dateToString: { format: BUCKET_FORMAT[options.bucket], date: '$createdAt', timezone: REPORT_TIMEZONE } };
  }

  const rows = await db
    .collection('transactions')
    .aggregate([{ $match: match }, { $group: { _id: id, total: { $sum: '$amount' }, count: { $sum: 1 } } }])
    .toArray();

  return rows.map((row) => ({
    type: String(row._id.type),
    status: String(row._id.status),
    service: row._id.service ?? null,
    bucket: row._id.bucket ?? null,
    total: Number(row.total) || 0,
    count: Number(row.count) || 0,
  }));
}

export interface Figures {
  payments: number;
  gtv: number;
  commission: number;
  refundDeductions: number;
  platformRevenue: number;
  gst: number;
  gatewayFees: number;
  refunds: number;
  refundCount: number;
  settlementsPaid: number;
  netToPayees: number;
  /** Coupon discounts the platform funds; owed to payees on top of what customers paid. */
  couponDiscounts: number;
  /** Platform revenue less the coupon discounts it funded. */
  platformNet: number;
}

/** Applies the published definitions to a set of grouped ledger rows. */
export function figuresFrom(groups: LedgerGroup[]): Figures {
  const sum = (type: string) =>
    groups.filter((g) => g.type === type && g.status === 'success').reduce((total, g) => total + g.total, 0);
  const count = (type: string) =>
    groups.filter((g) => g.type === type && g.status === 'success').reduce((total, g) => total + g.count, 0);

  const gtv = sum('payment');
  const commission = sum('commission');
  const refundDeductions = sum('refund_deduction');
  const gst = sum('gst');
  const gatewayFees = sum('gateway_fee');
  const refunds = sum('refund');
  const couponDiscounts = sum(COUPON_DISCOUNT_KIND);

  return {
    payments: count('payment'),
    gtv: roundMoney(gtv),
    commission: roundMoney(commission),
    refundDeductions: roundMoney(refundDeductions),
    platformRevenue: roundMoney(commission + refundDeductions),
    gst: roundMoney(gst),
    gatewayFees: roundMoney(gatewayFees),
    refunds: roundMoney(refunds),
    refundCount: count('refund'),
    settlementsPaid: roundMoney(sum('settlement')),
    netToPayees: roundMoney(gtv + couponDiscounts - commission - gst - gatewayFees - refunds - refundDeductions),
    couponDiscounts: roundMoney(couponDiscounts),
    platformNet: roundMoney(commission + refundDeductions - couponDiscounts),
  };
}

export function serviceLabel(value: string | null | undefined): string {
  if (!value) return 'Not set';
  return SERVICES.find((service) => service.value === value)?.label || value;
}

function createdBetween(range: DateRange) {
  return { $gte: range.start, $lt: range.end };
}

/* ------------------------------------------------------------------ */
/* Pending settlements                                                 */
/* ------------------------------------------------------------------ */

const typeSum = (type: string) => ({ $sum: { $cond: [{ $eq: ['$type', type] }, '$amount', 0] } });

/**
 * One row per payee with the same arithmetic as `payeeBalance` in
 * lib/ledger.ts, computed for every payee at once inside MongoDB.
 */
function payeeBalanceStages(): Record<string, any>[] {
  return [
    { $match: { status: 'success', payeeType: { $nin: [null, 'platform'] }, payeeId: { $nin: [null, ''] } } },
    {
      $group: {
        _id: { payeeType: '$payeeType', payeeId: '$payeeId' },
        payeeName: { $max: '$payeeName' },
        gross: typeSum('payment'),
        commission: typeSum('commission'),
        gst: typeSum('gst'),
        gatewayFee: typeSum('gateway_fee'),
        refunds: typeSum('refund'),
        refundDeductions: typeSum('refund_deduction'),
        couponDiscounts: {
          $sum: {
            $cond: [{ $and: [{ $eq: ['$type', 'adjustment'] }, { $eq: ['$meta.kind', COUPON_DISCOUNT_KIND] }] }, '$amount', 0],
          },
        },
        settled: typeSum('settlement'),
      },
    },
    {
      // Same rule as payeeBalance: the cancellation charge kept under a refund
      // rule is the platform's, so it is not owed to the payee.
      $addFields: {
        earned: { $subtract: [{ $add: ['$gross', '$couponDiscounts'] }, { $add: ['$commission', '$gst', '$gatewayFee', '$refunds', '$refundDeductions'] }] },
      },
    },
    { $addFields: { pending: { $subtract: ['$earned', '$settled'] } } },
  ];
}

export async function pendingSettlementTotals(db: Db) {
  await syncCouponDiscounts(db);
  const [balances] = await db
    .collection('transactions')
    .aggregate([
      ...payeeBalanceStages(),
      {
        $group: {
          _id: null,
          payees: { $sum: 1 },
          payeesOwed: { $sum: { $cond: [{ $gte: ['$pending', 0.005] }, 1, 0] } },
          owed: { $sum: { $cond: [{ $gte: ['$pending', 0.005] }, '$pending', 0] } },
          payeesOverpaid: { $sum: { $cond: [{ $lte: ['$pending', -0.005] }, 1, 0] } },
          overpaid: { $sum: { $cond: [{ $lte: ['$pending', -0.005] }, { $multiply: ['$pending', -1] }, 0] } },
        },
      },
    ])
    .toArray();

  const unpaid = await db
    .collection('settlements')
    .aggregate([
      { $match: { status: { $ne: 'paid' } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: { $convert: { input: '$netAmount', to: 'double', onError: 0, onNull: 0 } } },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return {
    payeeBalances: {
      payees: balances?.payees || 0,
      payeesOwed: balances?.payeesOwed || 0,
      owed: roundMoney(balances?.owed || 0),
      payeesOverpaid: balances?.payeesOverpaid || 0,
      overpaid: roundMoney(balances?.overpaid || 0),
    },
    unpaidSettlements: {
      count: unpaid.reduce((total, row) => total + row.count, 0),
      total: roundMoney(unpaid.reduce((total, row) => total + row.total, 0)),
      byStatus: unpaid.map((row) => ({ status: String(row._id), count: row.count, total: roundMoney(row.total) })),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Finance overview                                                    */
/* ------------------------------------------------------------------ */

function bucketsBetween(range: DateRange, bucket: Bucket): string[] {
  const out: string[] = [];
  if (bucket === 'day') {
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) out.push(day);
    return out;
  }
  let month = range.from.slice(0, 7);
  const last = range.to.slice(0, 7);
  while (month <= last) {
    out.push(month);
    const date = new Date(month + '-01T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + 1);
    month = date.toISOString().slice(0, 7);
  }
  return out;
}

export async function financeOverview(db: Db, range: DateRange) {
  await ensureIndexes(db);

  const bucket: Bucket = range.days <= 60 ? 'day' : 'month';
  const [groups, ledgerEntries, pending, unverifiedRows] = await Promise.all([
    groupLedger(db, { createdAt: createdBetween(range) }, { byService: true, bucket }),
    db.collection('transactions').estimatedDocumentCount(),
    pendingSettlementTotals(db),
    db
      .collection('bookings')
      .aggregate([
        { $match: { paymentStatus: 'unverified' } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            value: { $sum: { $convert: { input: '$totalPrice', to: 'double', onError: 0, onNull: 0 } } },
          },
        },
      ])
      .toArray(),
  ]);

  const totals = figuresFrom(groups);
  const paymentsWith = (status: string) => {
    const rows = groups.filter((g) => g.type === 'payment' && g.status === status);
    return {
      count: rows.reduce((total, g) => total + g.count, 0),
      value: roundMoney(rows.reduce((total, g) => total + g.total, 0)),
    };
  };

  const services = SERVICES.map((service) => {
    const own = groups.filter((g) => g.service === service.value);
    return { service: service.value, label: service.label, entries: own.reduce((t, g) => t + g.count, 0), ...figuresFrom(own) };
  });
  // Entries written with a service that is not in the list are still shown, never dropped.
  const known = new Set<string>(SERVICES.map((service) => service.value));
  const otherValues = Array.from(new Set(groups.map((g) => g.service || '').filter((value) => !known.has(value))));
  for (const value of otherValues) {
    const own = groups.filter((g) => (g.service || '') === value);
    services.push({ service: value as any, label: serviceLabel(value) as any, entries: own.reduce((t, g) => t + g.count, 0), ...figuresFrom(own) });
  }

  const trend = bucketsBetween(range, bucket).map((key) => {
    const own = figuresFrom(groups.filter((g) => g.bucket === key));
    return { bucket: key, gtv: own.gtv, platformRevenue: own.platformRevenue, refunds: own.refunds };
  });

  const serviceRevenue = (value: string) => services.find((row) => row.service === value)?.gtv || 0;

  return {
    range: { preset: range.preset, from: range.from, to: range.to, days: range.days, label: range.label },
    timezone: REPORT_TIMEZONE_LABEL,
    generatedAt: new Date().toISOString(),
    ledgerEntries,
    entriesInRange: groups.reduce((total, g) => total + g.count, 0),
    totals,
    membershipRevenue: serviceRevenue('membership'),
    advertisingRevenue: serviceRevenue('advertising'),
    failedPayments: paymentsWith('failed'),
    disputedPayments: paymentsWith('disputed'),
    pendingPayments: paymentsWith('pending'),
    pendingSettlements: pending,
    unverifiedBookings: { count: unverifiedRows[0]?.count || 0, value: roundMoney(unverifiedRows[0]?.value || 0) },
    trendBucket: bucket,
    trend,
    services,
  };
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export type ColumnType = 'text' | 'money' | 'number' | 'percent' | 'datetime';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ReportResult {
  key: string;
  name: string;
  rangeLabel: string;
  timezone: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  /** Totals for the whole date range, computed in the database, not from the rows shown. */
  totals: Record<string, any> | null;
  summary: { label: string; value: number; type: ColumnType }[];
  notes: string[];
  /** Which records and statuses the report counts (from the catalogue). */
  counts: string;
  /** Extra header lines for this report, e.g. the platform GST number. */
  header: { label: string; value: string }[];
  /** Number of rows that exist; larger than rows.length when the list was cut off. */
  totalRows: number;
}

const col = (key: string, label: string, type: ColumnType = 'text'): ReportColumn => ({ key, label, type });
const SCREEN_ROWS = 500;
const EXPORT_ROWS = 50_000;

const FIGURE_COLUMNS: ReportColumn[] = [
  col('payments', 'Successful payments', 'number'),
  col('gtv', 'GTV', 'money'),
  col('commission', 'Commission', 'money'),
  col('refundDeductions', 'Refund deductions', 'money'),
  col('platformRevenue', 'Platform revenue', 'money'),
  col('gst', 'GST collected', 'money'),
  col('gatewayFees', 'Gateway fees', 'money'),
  col('refunds', 'Refunds', 'money'),
  col('netToPayees', 'Net to payees', 'money'),
  col('settlementsPaid', 'Settlements paid', 'money'),
];

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

async function periodReport(db: Db, range: DateRange, bucket: Bucket, statement: boolean) {
  const groups = await groupLedger(db, { createdAt: createdBetween(range) }, { byService: true, bucket });
  const label = bucket === 'day' ? 'Date' : bucket === 'month' ? 'Month' : 'Year';
  const revenueOf = (own: LedgerGroup[], service: string) => figuresFrom(own.filter((g) => g.service === service)).gtv;

  const build = (own: LedgerGroup[]) => ({
    ...figuresFrom(own),
    membershipRevenue: revenueOf(own, 'membership'),
    advertisingRevenue: revenueOf(own, 'advertising'),
  });

  const rows = uniqueSorted(groups.map((g) => g.bucket)).map((key) => ({
    period: key,
    ...build(groups.filter((g) => g.bucket === key)),
  }));

  const columns = statement
    ? [col('period', label), ...FIGURE_COLUMNS]
    : [
        col('period', label),
        col('payments', 'Successful payments', 'number'),
        col('gtv', 'GTV', 'money'),
        col('commission', 'Commission', 'money'),
        col('refundDeductions', 'Refund deductions', 'money'),
        col('platformRevenue', 'Platform revenue', 'money'),
        col('membershipRevenue', 'Membership revenue', 'money'),
        col('advertisingRevenue', 'Advertisement revenue', 'money'),
      ];

  return {
    columns,
    rows,
    totals: { period: 'Total', ...build(groups) },
    notes: [`${label}s without ledger entries are not listed.`],
  };
}

/** GSTIN: 2 digits, 10-character PAN, entity number, 'Z', check character. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/** The platform's own GST number, from Finance settings. Null when it has not been recorded. */
export async function platformGstNumber(db: Db): Promise<string | null> {
  try {
    const settings = await db.collection('settings').findOne({ type: 'finance' }, { projection: { gstNumber: 1 } });
    const value = typeof settings?.gstNumber === 'string' ? settings.gstNumber.trim().toUpperCase() : '';
    return value || null;
  } catch (error) {
    console.error('Could not read the platform GST number:', error);
    return null;
  }
}

/**
 * One row per taxable supply. GST arises in two ways in the ledger:
 *   - on the platform's commission (taxable value = the commission), and
 *   - collected on a sale the platform makes itself, e.g. an advertiser
 *     invoice (taxable value = the payment the GST was charged on).
 * Rows and totals are built in MongoDB from the same entries, so the rows
 * always add up to the totals.
 */
async function gstReport(db: Db, range: DateRange, limit: number) {
  const transactions = db.collection('transactions');
  const whenType = (type: string, value: any, otherwise: any = 0) => ({ $cond: [{ $eq: ['$type', type] }, value, otherwise] });

  const stages: Record<string, any>[] = [
    { $match: { type: { $in: ['commission', 'gst'] }, status: 'success', createdAt: createdBetween(range) } },
    {
      $addFields: {
        basis: {
          $cond: [
            {
              $and: [
                { $eq: ['$type', 'gst'] },
                { $regexMatch: { input: { $convert: { input: '$description', to: 'string', onError: '', onNull: '' } }, regex: '^GST collected' } },
              ],
            },
            'sale',
            'commission',
          ],
        },
        parent: { $ifNull: ['$parentReference', '$reference'] },
      },
    },
    {
      $group: {
        _id: { parent: '$parent', basis: '$basis' },
        date: { $min: '$createdAt' },
        commission: { $sum: whenType('commission', '$amount') },
        gst: { $sum: whenType('gst', '$amount') },
        rate: { $max: '$ruleSnapshot.gstPercent' },
        service: { $first: '$service' },
        payeeType: { $first: '$payeeType' },
        payeeName: { $max: '$payeeName' },
        payeeId: { $max: '$payeeId' },
        bookingId: { $max: '$bookingId' },
        hasParent: { $max: { $cond: [{ $ifNull: ['$parentReference', false] }, 1, 0] } },
        commissionRefs: { $push: whenType('commission', '$reference', '$$REMOVE') },
        gstRefs: { $push: whenType('gst', '$reference', '$$REMOVE') },
      },
    },
    {
      $lookup: {
        from: 'transactions',
        let: { reference: '$_id.parent' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$reference', '$$reference'] }, { $eq: ['$type', 'payment'] }] } } },
          { $limit: 1 },
          { $project: { amount: 1 } },
        ],
        as: 'payment',
      },
    },
    { $addFields: { paymentAmount: { $ifNull: [{ $arrayElemAt: ['$payment.amount', 0] }, 0] } } },
    { $addFields: { taxable: { $cond: [{ $eq: ['$_id.basis', 'sale'] }, '$paymentAmount', '$commission'] } } },
  ];

  const [list, totalsRow, gstNumber] = await Promise.all([
    transactions.aggregate([...stages, { $sort: { date: 1, '_id.parent': 1, '_id.basis': 1 } }, { $limit: limit }, { $project: { payment: 0 } }]).toArray(),
    transactions
      .aggregate([
        ...stages,
        {
          $group: {
            _id: null,
            rows: { $sum: 1 },
            taxable: { $sum: '$taxable' },
            taxableCommission: { $sum: { $cond: [{ $eq: ['$_id.basis', 'commission'] }, '$taxable', 0] } },
            taxableSales: { $sum: { $cond: [{ $eq: ['$_id.basis', 'sale'] }, '$taxable', 0] } },
            gstCommission: { $sum: { $cond: [{ $eq: ['$_id.basis', 'commission'] }, '$gst', 0] } },
            gstSales: { $sum: { $cond: [{ $eq: ['$_id.basis', 'sale'] }, '$gst', 0] } },
            gst: { $sum: '$gst' },
          },
        },
      ])
      .toArray(),
    platformGstNumber(db),
  ]);

  const rows = list.map((row) => {
    const sale = row._id.basis === 'sale';
    const taxable = roundMoney(Number(row.taxable) || 0);
    const gst = roundMoney(Number(row.gst) || 0);
    let rate: number | string = '';
    if (sale) rate = taxable > 0 ? roundMoney((gst / taxable) * 100) : '';
    else if (row.rate !== null && row.rate !== undefined && Number.isFinite(Number(row.rate))) rate = Number(row.rate);
    return {
      date: row.date,
      basis: sale ? 'GST collected on a platform sale' : 'GST on commission',
      paymentReference: row.hasParent ? String(row._id.parent) : '',
      reference: (row.commissionRefs || []).join(' '),
      bookingId: row.bookingId || '',
      service: serviceLabel(row.service),
      payeeType: row.payeeType || '',
      payeeName: row.payeeName || '',
      payeeId: row.payeeId ? String(row.payeeId) : '',
      taxableValue: taxable,
      gstRate: rate,
      gstAmount: gst,
      gstReference: (row.gstRefs || []).join(' '),
    };
  });

  const totals = totalsRow[0];
  const total = (key: string) => roundMoney(Number(totals?.[key]) || 0);
  return {
    columns: [
      col('date', 'Date (IST)', 'datetime'),
      col('basis', 'Basis'),
      col('paymentReference', 'Payment reference'),
      col('reference', 'Commission reference'),
      col('bookingId', 'Booking reference'),
      col('service', 'Service'),
      col('payeeType', 'Payee type'),
      col('payeeName', 'Payee'),
      col('payeeId', 'Payee ID'),
      col('taxableValue', 'Taxable value', 'money'),
      col('gstRate', 'GST rate %', 'percent'),
      col('gstAmount', 'GST amount', 'money'),
      col('gstReference', 'GST entry reference'),
    ],
    rows,
    totalRows: totals?.rows || 0,
    totals: totals ? { date: 'Total', taxableValue: total('taxable'), gstAmount: total('gst') } : null,
    summary: [
      { label: 'Taxable value: commission', value: total('taxableCommission'), type: 'money' as ColumnType },
      { label: 'GST on commission', value: total('gstCommission'), type: 'money' as ColumnType },
      { label: 'Taxable value: platform sales', value: total('taxableSales'), type: 'money' as ColumnType },
      { label: 'GST collected on platform sales', value: total('gstSales'), type: 'money' as ColumnType },
    ],
    header: [
      {
        label: 'Platform GST number (GSTIN)',
        value: gstNumber
          ? GSTIN_PATTERN.test(gstNumber)
            ? gstNumber
            : `${gstNumber} (not in the 15-character GSTIN format: check it in Finance settings)`
          : 'Not recorded in Finance settings',
      },
    ],
    notes: [
      "GST on commission: the taxable value is the platform's commission on the payment, and the rate is the GST rate saved in the commission rule that was applied. The rate is blank when the rule had no GST rate.",
      'GST collected on a platform sale (for example an advertiser invoice): the taxable value is the payment the GST was charged on, and the rate is worked out from the two amounts (GST amount / taxable value).',
      "The total GST amount equals the sum of all 'gst' ledger entries with status 'success' in the date range. A row with GST but no taxable value means the commission entry was written in a different period or does not exist.",
    ],
  };
}

/** Services the platform sells itself: the whole payment is its income. Same list as the dashboard. */
const DIRECT_SERVICES = new Set<string>(['membership', 'advertising', 'premium_search']);

async function serviceReport(db: Db, range: DateRange) {
  const groups = await groupLedger(db, { createdAt: createdBetween(range) }, { byService: true });
  const share = (earnings: number, gtv: number) => (gtv > 0 ? roundMoney((earnings / gtv) * 100) : '');
  const rows = uniqueSorted(groups.map((g) => g.service || 'Not set')).map((service) => {
    const figures = figuresFrom(groups.filter((g) => (g.service || 'Not set') === service));
    const direct = DIRECT_SERVICES.has(service);
    const earnings = direct ? roundMoney(figures.gtv - figures.refunds) : figures.platformRevenue;
    return {
      service: serviceLabel(service),
      basis: direct ? 'Sold by the platform' : 'Commission based',
      ...figures,
      earnings,
      earningsShare: share(earnings, figures.gtv),
    };
  });
  const totals = figuresFrom(groups);
  const totalEarnings = roundMoney(rows.reduce((sum, row) => sum + row.earnings, 0));
  return {
    columns: [
      col('service', 'Service'),
      col('basis', 'Basis'),
      ...FIGURE_COLUMNS,
      col('earnings', 'Platform earnings', 'money'),
      col('earningsShare', 'Platform earnings as % of GTV', 'percent'),
    ],
    rows,
    totals: { service: 'Total', ...totals, earnings: totalEarnings, earningsShare: share(totalEarnings, totals.gtv) },
    notes: [
      'Platform earnings is what the platform keeps from the service. Commission based: commission plus refund deductions (the Platform revenue column). Sold by the platform (membership, advertising, premium search pass): successful payments less refunds, because the whole payment is the platform\'s income.',
      'Operating costs such as staff, hosting and marketing are not recorded in the ledger, so this is earnings before those costs. GST collected and gateway fees are shown in their own columns and are not deducted from platform earnings.',
      'Services without ledger entries in the date range are not listed.',
    ],
  };
}

async function commissionReport(db: Db, range: DateRange) {
  // GST collected on the platform's own sales is not GST on commission and is left out here (it is in the GST report).
  const groups = await groupLedger(
    db,
    {
      status: 'success',
      createdAt: createdBetween(range),
      $or: [{ type: 'commission' }, { type: 'gst', description: { $not: /^GST collected/ } }],
    },
    { byService: true, bucket: 'day' }
  );
  const keys = uniqueSorted(groups.map((g) => `${g.bucket}|${g.service || ''}`));
  const pick = (type: string, bucket: string, service: string) =>
    groups.filter((g) => g.type === type && g.bucket === bucket && (g.service || '') === service);

  const rows = keys.map((key) => {
    const [bucket, service] = key.split('|');
    const commission = pick('commission', bucket, service);
    return {
      period: bucket,
      service: serviceLabel(service),
      entries: commission.reduce((t, g) => t + g.count, 0),
      commission: roundMoney(commission.reduce((t, g) => t + g.total, 0)),
      gst: roundMoney(pick('gst', bucket, service).reduce((t, g) => t + g.total, 0)),
    };
  });
  const totals = figuresFrom(groups);
  return {
    columns: [
      col('period', 'Date'),
      col('service', 'Service'),
      col('entries', 'Commission entries', 'number'),
      col('commission', 'Commission', 'money'),
      col('gst', 'GST on commission', 'money'),
    ],
    rows,
    totals: {
      period: 'Total',
      entries: groups.filter((g) => g.type === 'commission').reduce((t, g) => t + g.count, 0),
      commission: totals.commission,
      gst: totals.gst,
    },
    notes: [
      'GST on commission is shown for reference and is not part of commission revenue.',
      'GST collected on sales the platform makes itself (for example advertiser invoices) is not GST on commission; it is listed in the GST report.',
    ],
  };
}

async function singleServiceReport(db: Db, range: DateRange, service: string) {
  const groups = await groupLedger(
    db,
    { service, type: { $in: ['payment', 'refund'] }, createdAt: createdBetween(range) },
    { bucket: 'day' }
  );
  const build = (own: LedgerGroup[]) => {
    const figures = figuresFrom(own);
    const failed = own.filter((g) => g.type === 'payment' && g.status === 'failed').reduce((t, g) => t + g.count, 0);
    return {
      payments: figures.payments,
      revenue: figures.gtv,
      failedPayments: failed,
      refunds: figures.refunds,
      net: roundMoney(figures.gtv - figures.refunds),
    };
  };
  const rows = uniqueSorted(groups.map((g) => g.bucket)).map((key) => ({
    period: key,
    ...build(groups.filter((g) => g.bucket === key)),
  }));
  return {
    columns: [
      col('period', 'Date'),
      col('payments', 'Successful payments', 'number'),
      col('revenue', 'Revenue', 'money'),
      col('failedPayments', 'Failed payments', 'number'),
      col('refunds', 'Refunds', 'money'),
      col('net', 'Revenue less refunds', 'money'),
    ],
    rows,
    totals: { period: 'Total', ...build(groups) },
    notes: [`Revenue is the sum of successful 'payment' ledger entries for the service '${service}'.`],
  };
}

const toDouble = (field: string) => ({ $convert: { input: field, to: 'double', onError: 0, onNull: 0 } });
const isConfirmed = { $in: ['$status', ['confirmed', 'attended']] };

async function bookingsReport(db: Db, range: DateRange, limit: number) {
  const sums = {
    bookings: { $sum: 1 },
    confirmed: { $sum: { $cond: [isConfirmed, 1, 0] } },
    seats: { $sum: { $cond: [isConfirmed, toDouble('$totalSeats'), 0] } },
    value: { $sum: { $cond: [isConfirmed, toDouble('$totalPrice'), 0] } },
    paidValue: {
      $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, toDouble({ $ifNull: ['$amountPaid', '$totalPrice'] } as any), 0] },
    },
    cancellations: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
    checkIns: { $sum: { $cond: [{ $eq: ['$checkedIn', true] }, 1, 0] } },
  };
  const match = { createdAt: createdBetween(range) };
  const bookings = db.collection('bookings');

  const [grouped, overall, groupCount] = await Promise.all([
    bookings
      .aggregate([
        { $match: match },
        { $group: { _id: { eventId: '$eventId', eventTitle: '$eventTitle', venue: '$venue', eventDate: '$eventDate' }, ...sums } },
        { $sort: { value: -1, bookings: -1 } },
        { $limit: limit },
      ])
      .toArray(),
    bookings.aggregate([{ $match: match }, { $group: { _id: null, ...sums } }]).toArray(),
    bookings
      .aggregate([
        { $match: match },
        { $group: { _id: { eventId: '$eventId', eventTitle: '$eventTitle', venue: '$venue', eventDate: '$eventDate' } } },
        { $count: 'n' },
      ])
      .toArray(),
  ]);

  // The city is stored on the event, not on the booking.
  const eventIds = Array.from(
    new Set(grouped.map((row) => String(row._id.eventId || '')).filter((id) => id.length === 24 && ObjectId.isValid(id)))
  );
  const events = eventIds.length
    ? await db
        .collection('events')
        .find({ _id: { $in: eventIds.map((id) => new ObjectId(id)) } })
        .project({ 'location.city': 1, 'location.name': 1 })
        .toArray()
    : [];
  const eventById = new Map(events.map((event) => [String(event._id), event]));

  const money = (row: any) => ({
    bookings: row.bookings,
    confirmed: row.confirmed,
    seats: row.seats,
    value: roundMoney(row.value),
    paidValue: roundMoney(row.paidValue),
    cancellations: row.cancellations,
    checkIns: row.checkIns,
  });

  const rows = grouped.map((row) => {
    const event = eventById.get(String(row._id.eventId || ''));
    return {
      event: row._id.eventTitle || '',
      eventId: row._id.eventId ? String(row._id.eventId) : '',
      venue: (typeof row._id.venue === 'string' ? row._id.venue : '') || event?.location?.name || '',
      city: event?.location?.city || '',
      eventDate: row._id.eventDate ? String(row._id.eventDate) : '',
      ...money(row),
    };
  });

  return {
    columns: [
      col('event', 'Event'),
      col('eventId', 'Event ID'),
      col('venue', 'Venue'),
      col('city', 'City'),
      col('eventDate', 'Event date'),
      col('bookings', 'Bookings made', 'number'),
      col('confirmed', 'Confirmed bookings', 'number'),
      col('seats', 'Seats (confirmed)', 'number'),
      col('value', 'Booked value (confirmed)', 'money'),
      col('paidValue', 'Verified by gateway', 'money'),
      col('cancellations', 'Cancellations', 'number'),
      col('checkIns', 'Check-ins', 'number'),
    ],
    rows,
    totalRows: groupCount[0]?.n || 0,
    totals: overall[0] ? { event: 'Total', ...money(overall[0]) } : null,
    notes: [
      'The date range is applied to the time the booking was made, not to the event date.',
      "Confirmed bookings have status 'confirmed' or 'attended'. Seats and booked value count confirmed bookings only.",
      "Verified by gateway is the amount on bookings whose payment status is 'paid'. Booked value that is not verified by the gateway is not in the ledger and is not revenue.",
      'The city comes from the event record and is blank when the event no longer exists.',
    ],
  };
}

async function customersReport(db: Db, range: DateRange) {
  const day = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TIMEZONE } };
  const realBooking = { status: { $nin: ['pending_payment', 'expired'] }, userPhone: { $nin: [null, ''] } };
  const earlierBooking = {
    $lookup: {
      from: 'bookings',
      let: { phone: '$_id.phone', first: '$first' },
      pipeline: [
        {
          $match: {
            $expr: { $and: [{ $eq: ['$userPhone', '$$phone'] }, { $lt: ['$createdAt', '$$first'] }] },
            status: { $nin: ['pending_payment', 'expired'] },
          },
        },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ],
      as: 'earlier',
    },
  };
  const bookingMatch = { createdAt: createdBetween(range), ...realBooking };

  const [newUsers, bookers, overall] = await Promise.all([
    db
      .collection('users')
      .aggregate([{ $match: { createdAt: createdBetween(range) } }, { $group: { _id: day, count: { $sum: 1 } } }])
      .toArray(),
    db
      .collection('bookings')
      .aggregate([
        { $match: bookingMatch },
        { $group: { _id: { day, phone: '$userPhone' }, bookings: { $sum: 1 }, first: { $min: '$createdAt' } } },
        earlierBooking,
        {
          $group: {
            _id: '$_id.day',
            bookings: { $sum: '$bookings' },
            activeBookers: { $sum: 1 },
            repeatBookers: { $sum: { $cond: [{ $gt: [{ $size: '$earlier' }, 0] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    db
      .collection('bookings')
      .aggregate([
        { $match: bookingMatch },
        { $group: { _id: { phone: '$userPhone' }, bookings: { $sum: 1 }, first: { $min: '$createdAt' } } },
        earlierBooking,
        {
          $group: {
            _id: null,
            bookings: { $sum: '$bookings' },
            activeBookers: { $sum: 1 },
            repeatBookers: {
              $sum: { $cond: [{ $or: [{ $gt: [{ $size: '$earlier' }, 0] }, { $gt: ['$bookings', 1] }] }, 1, 0] },
            },
          },
        },
      ])
      .toArray(),
  ]);

  const usersByDay = new Map(newUsers.map((row) => [String(row._id), row.count as number]));
  const bookersByDay = new Map(bookers.map((row) => [String(row._id), row]));
  const days = uniqueSorted([...Array.from(usersByDay.keys()), ...Array.from(bookersByDay.keys())]);

  const rows = days.map((key) => ({
    period: key,
    newUsers: usersByDay.get(key) || 0,
    bookings: bookersByDay.get(key)?.bookings || 0,
    activeBookers: bookersByDay.get(key)?.activeBookers || 0,
    repeatBookers: bookersByDay.get(key)?.repeatBookers || 0,
  }));

  const totalNewUsers = newUsers.reduce((total, row) => total + row.count, 0);
  return {
    columns: [
      col('period', 'Date'),
      col('newUsers', 'New users', 'number'),
      col('bookings', 'Bookings', 'number'),
      col('activeBookers', 'Active bookers', 'number'),
      col('repeatBookers', 'Repeat bookers', 'number'),
    ],
    rows,
    totals: null,
    summary: [
      { label: 'New users in the range', value: totalNewUsers, type: 'number' as ColumnType },
      { label: 'Bookings in the range', value: overall[0]?.bookings || 0, type: 'number' as ColumnType },
      { label: 'Active bookers in the range (distinct customers)', value: overall[0]?.activeBookers || 0, type: 'number' as ColumnType },
      { label: 'Repeat bookers in the range (distinct customers)', value: overall[0]?.repeatBookers || 0, type: 'number' as ColumnType },
    ],
    notes: [
      'New users: accounts created that day. Active bookers: distinct customers (by phone) who made a booking that day.',
      'Repeat bookers per day: active bookers who had made an earlier booking. Repeat bookers for the range: customers who booked more than once in the range or had booked before it.',
      "Bookings with status 'pending_payment' or 'expired' are not counted.",
      'The daily columns cannot be added up to the range figures, because one customer can book on several days.',
      'Days with no new users and no bookings are not listed.',
    ],
  };
}

async function payeeBalancesReport(db: Db, limit: number) {
  await syncCouponDiscounts(db);
  const transactions = db.collection('transactions');
  const [list, totalsRow] = await Promise.all([
    transactions.aggregate([...payeeBalanceStages(), { $sort: { pending: -1 } }, { $limit: limit }]).toArray(),
    transactions
      .aggregate([
        ...payeeBalanceStages(),
        {
          $group: {
            _id: null,
            payees: { $sum: 1 },
            gross: { $sum: '$gross' },
            commission: { $sum: '$commission' },
            gst: { $sum: '$gst' },
            gatewayFee: { $sum: '$gatewayFee' },
            refunds: { $sum: '$refunds' },
            earned: { $sum: '$earned' },
            settled: { $sum: '$settled' },
            pending: { $sum: '$pending' },
          },
        },
      ])
      .toArray(),
  ]);
  const amounts = (row: any) => ({
    gross: roundMoney(row.gross),
    commission: roundMoney(row.commission),
    gst: roundMoney(row.gst),
    gatewayFee: roundMoney(row.gatewayFee),
    refunds: roundMoney(row.refunds),
    earned: roundMoney(row.earned),
    settled: roundMoney(row.settled),
    pending: roundMoney(row.pending),
  });
  const totals = await pendingSettlementTotals(db);
  return {
    columns: [
      col('payeeType', 'Payee type'),
      col('payeeName', 'Payee'),
      col('payeeId', 'Payee ID'),
      col('gross', 'Payments', 'money'),
      col('commission', 'Commission', 'money'),
      col('gst', 'GST', 'money'),
      col('gatewayFee', 'Gateway fees', 'money'),
      col('refunds', 'Refunds', 'money'),
      col('earned', 'Earned', 'money'),
      col('settled', 'Settled', 'money'),
      col('pending', 'Pending', 'money'),
    ],
    rows: list.map((row) => ({
      payeeType: row._id.payeeType,
      payeeName: row.payeeName || '',
      payeeId: String(row._id.payeeId),
      ...amounts(row),
    })),
    totalRows: totalsRow[0]?.payees || 0,
    totals: totalsRow[0] ? { payeeType: 'Total', ...amounts(totalsRow[0]) } : null,
    summary: [
      { label: 'Owed to payees (positive balances)', value: totals.payeeBalances.owed, type: 'money' as ColumnType },
      { label: 'Payees owed', value: totals.payeeBalances.payeesOwed, type: 'number' as ColumnType },
      { label: 'Paid in excess of earnings (negative balances)', value: totals.payeeBalances.overpaid, type: 'money' as ColumnType },
    ],
    notes: [
      "Earned = payments - commission - GST - gateway fees - refunds. Pending = earned - settled. Only ledger entries with status 'success' are counted.",
      'This is a position over all dates, as at the time the report was generated. The date range is not applied.',
      'The Pending total is the net of positive and negative balances; the amount owed counts positive balances only.',
    ],
  };
}

async function unpaidSettlementsReport(db: Db, limit: number) {
  const match = { status: { $ne: 'paid' } };
  const settlements = db.collection('settlements');
  const fields = ['grossAmount', 'commissionAmount', 'gstAmount', 'gatewayFeeAmount', 'refundsAmount', 'netAmount'];
  const [list, totalsRow] = await Promise.all([
    settlements.find(match).sort({ dueDate: 1, createdAt: 1 }).limit(limit).toArray(),
    settlements
      .aggregate([
        { $match: match },
        { $group: { _id: null, count: { $sum: 1 }, ...Object.fromEntries(fields.map((f) => [f, { $sum: toDouble('$' + f) }])) } },
      ])
      .toArray(),
  ]);
  const number = (value: any) => roundMoney(Number(value) || 0);
  return {
    columns: [
      col('payeeType', 'Payee type'),
      col('payeeName', 'Payee'),
      col('payeeId', 'Payee ID'),
      col('service', 'Service'),
      col('periodFrom', 'Period from', 'datetime'),
      col('periodTo', 'Period to', 'datetime'),
      col('grossAmount', 'Gross', 'money'),
      col('commissionAmount', 'Commission', 'money'),
      col('gstAmount', 'GST', 'money'),
      col('gatewayFeeAmount', 'Gateway fees', 'money'),
      col('refundsAmount', 'Refunds', 'money'),
      col('netAmount', 'Net payable', 'money'),
      col('dueDate', 'Due date', 'datetime'),
      col('status', 'Status'),
      col('createdAt', 'Created (IST)', 'datetime'),
    ],
    rows: list.map((row) => ({
      payeeType: row.payeeType || '',
      payeeName: row.payeeName || '',
      payeeId: row.payeeId ? String(row.payeeId) : '',
      service: serviceLabel(row.service),
      periodFrom: row.periodFrom || '',
      periodTo: row.periodTo || '',
      ...Object.fromEntries(fields.map((f) => [f, number(row[f])])),
      dueDate: row.dueDate || '',
      status: row.status || '',
      createdAt: row.createdAt || '',
    })),
    totalRows: totalsRow[0]?.count || 0,
    totals: totalsRow[0]
      ? { payeeType: 'Total', ...Object.fromEntries(fields.map((f) => [f, number(totalsRow[0][f])])) }
      : null,
    notes: [
      "Every settlement record whose status is not 'paid' (pending, awaiting second approval, approved, failed or on hold).",
      'This is a position as at the time the report was generated. The date range is not applied.',
    ],
  };
}

async function refundsReport(db: Db, range: DateRange) {
  const [grouped, ledger] = await Promise.all([
    db
      .collection('refunds')
      .aggregate([
        { $match: { createdAt: createdBetween(range) } },
        {
          $group: {
            _id: { status: '$status', service: '$service' },
            count: { $sum: 1 },
            amountPaid: { $sum: toDouble('$amountPaid') },
            deductionAmount: { $sum: toDouble('$deductionAmount') },
            refundAmount: { $sum: toDouble('$refundAmount') },
          },
        },
        { $sort: { '_id.status': 1, '_id.service': 1 } },
      ])
      .toArray(),
    groupLedger(db, { type: { $in: ['refund', 'refund_deduction'] }, createdAt: createdBetween(range) }),
  ]);

  const amounts = (rows: any[]) => ({
    count: rows.reduce((t, r) => t + r.count, 0),
    amountPaid: roundMoney(rows.reduce((t, r) => t + r.amountPaid, 0)),
    deductionAmount: roundMoney(rows.reduce((t, r) => t + r.deductionAmount, 0)),
    refundAmount: roundMoney(rows.reduce((t, r) => t + r.refundAmount, 0)),
  });
  const withStatus = (...statuses: string[]) => amounts(grouped.filter((row) => statuses.includes(row._id.status)));
  const figures = figuresFrom(ledger);

  return {
    columns: [
      col('status', 'Refund status'),
      col('service', 'Service'),
      col('count', 'Requests', 'number'),
      col('amountPaid', 'Amount paid by customers', 'money'),
      col('deductionAmount', 'Deductions kept', 'money'),
      col('refundAmount', 'Refund amount', 'money'),
    ],
    rows: grouped.map((row) => ({
      status: row._id.status || '',
      service: serviceLabel(row._id.service),
      ...amounts([row]),
    })),
    totals: grouped.length ? { status: 'Total', ...amounts(grouped) } : null,
    summary: [
      { label: 'Requested (awaiting a decision)', value: withStatus('requested', 'awaiting_second_approval').count, type: 'number' as ColumnType },
      { label: 'Approved (not yet processed)', value: withStatus('approved', 'processing').count, type: 'number' as ColumnType },
      { label: 'Processed', value: withStatus('processed').count, type: 'number' as ColumnType },
      { label: 'Rejected', value: withStatus('rejected').count, type: 'number' as ColumnType },
      { label: 'Refund amount processed', value: withStatus('processed').refundAmount, type: 'money' as ColumnType },
      { label: 'Deductions on processed refunds', value: withStatus('processed').deductionAmount, type: 'money' as ColumnType },
      { label: "Ledger: 'refund' entries in the range", value: figures.refunds, type: 'money' as ColumnType },
      { label: "Ledger: 'refund_deduction' entries in the range", value: figures.refundDeductions, type: 'money' as ColumnType },
    ],
    notes: [
      'The date range is applied to the time the refund was requested.',
      'Requested includes refunds awaiting a second approval. Approved includes refunds being processed by the gateway.',
      'The ledger figures count entries written in the same date range, so they differ from the processed amounts when a refund was requested in one period and processed in another.',
    ],
  };
}

/**
 * Builds one report. `forExport` raises the row limit; totals always cover the
 * whole range because they are computed separately in the database.
 */
export async function runReport(db: Db, key: string, range: DateRange, forExport = false): Promise<ReportResult | null> {
  const info = getReportInfo(key);
  if (!info) return null;
  await ensureIndexes(db);
  const limit = forExport ? EXPORT_ROWS : SCREEN_ROWS;

  let built: {
    columns: ReportColumn[];
    rows: Record<string, any>[];
    totals: Record<string, any> | null;
    notes: string[];
    totalRows?: number;
    summary?: ReportResult['summary'];
    header?: ReportResult['header'];
  };

  switch (key) {
    case 'daily_statement':
      built = await periodReport(db, range, 'day', true);
      break;
    case 'revenue_daily':
      built = await periodReport(db, range, 'day', false);
      break;
    case 'revenue_monthly':
      built = await periodReport(db, range, 'month', false);
      break;
    case 'revenue_yearly':
      built = await periodReport(db, range, 'year', false);
      break;
    case 'gst':
      built = await gstReport(db, range, limit);
      break;
    case 'service_profitability':
      built = await serviceReport(db, range);
      break;
    case 'commission_revenue':
      built = await commissionReport(db, range);
      break;
    case 'membership_revenue':
      built = await singleServiceReport(db, range, 'membership');
      break;
    case 'advertising_revenue':
      built = await singleServiceReport(db, range, 'advertising');
      break;
    case 'bookings':
      built = await bookingsReport(db, range, limit);
      break;
    case 'customers':
      built = await customersReport(db, range);
      break;
    case 'pending_settlements':
      built = await payeeBalancesReport(db, limit);
      break;
    case 'unpaid_settlements':
      built = await unpaidSettlementsReport(db, limit);
      break;
    case 'refunds':
      built = await refundsReport(db, range);
      break;
    default:
      return null;
  }

  return {
    key,
    name: info.label,
    rangeLabel: info.usesDateRange ? range.label : 'As at the time of generation (date range not applied)',
    timezone: REPORT_TIMEZONE_LABEL,
    generatedAt: new Date().toISOString(),
    columns: built.columns,
    rows: built.rows,
    totals: built.rows.length ? built.totals : null,
    summary: built.summary || [],
    notes: built.notes,
    counts: info.counts,
    header: built.header || [],
    totalRows: built.totalRows ?? built.rows.length,
  };
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

function csvCell(value: any, type: ColumnType = 'text'): string {
  if (value === null || value === undefined || value === '') return '';
  let text: string;
  if (type === 'datetime') text = istDateTime(value);
  else if (typeof value === 'number') {
    // Numbers are written plain so that a spreadsheet can add them up.
    return type === 'money' ? value.toFixed(2) : String(value);
  } else if (value instanceof Date) text = istDateTime(value);
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  // Neutralise spreadsheet formula injection in text cells.
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export interface ExportInput {
  name: string;
  rangeLabel: string;
  generatedBy?: string | null;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, any> | null;
  summary?: { label: string; value: any; type?: ColumnType }[];
  notes?: string[];
  /** Extra header lines, e.g. the filters that were applied. */
  filters?: { label: string; value: string }[];
  generatedAt?: Date;
  /** Which records and statuses the report counts. */
  counts?: string;
  /** Extra header lines for the report, e.g. the platform GST number. */
  header?: { label: string; value: string }[];
}

/**
 * The header block written at the top of every export, in every format:
 * report name, date range, timezone, when and by whom it was generated, what
 * the report counts, and any report-specific lines and filters.
 */
export function exportHeaderLines(input: ExportInput): { label: string; value: string }[] {
  const lines = [
    { label: 'Report', value: input.name },
    { label: 'Date range', value: input.rangeLabel },
    { label: 'Timezone', value: REPORT_TIMEZONE_LABEL },
    { label: 'Generated at', value: istDateTime(input.generatedAt || new Date()) + ' IST' },
  ];
  if (input.generatedBy) lines.push({ label: 'Generated by', value: input.generatedBy });
  if (input.counts) lines.push({ label: 'What this report counts', value: input.counts });
  for (const item of input.header || []) lines.push({ label: item.label, value: item.value });
  for (const filter of input.filters || []) lines.push({ label: 'Filter: ' + filter.label, value: filter.value });
  return lines;
}

/** Everything a report result contributes to an export, with the cut-off note when rows were limited. */
export function exportInputFor(report: ReportResult, generatedBy: string | null, filters?: ExportInput['filters']): ExportInput {
  return {
    name: report.name,
    rangeLabel: report.rangeLabel,
    generatedBy,
    generatedAt: new Date(report.generatedAt),
    columns: report.columns,
    rows: report.rows,
    totals: report.totals,
    summary: report.summary,
    counts: report.counts,
    header: report.header,
    filters,
    notes: [
      ...report.notes,
      ...(report.totalRows > report.rows.length
        ? [`Only the first ${report.rows.length} of ${report.totalRows} rows are listed. The total row covers every row.`]
        : []),
    ],
  };
}

/**
 * The CSV layout used by every export: header rows naming the report, the
 * date range, the timezone and the generation time, then the definitions that
 * apply, a blank line and the table.
 */
export function buildExportCsv(input: ExportInput): string {
  const line = (...cells: any[]) => cells.map((cell) => csvCell(cell)).join(',');
  const lines: string[] = exportHeaderLines(input).map((item) => line(item.label, item.value));
  for (const item of input.summary || []) {
    lines.push([csvCell('Summary: ' + item.label), csvCell(item.value, item.type || 'text')].join(','));
  }
  for (const definition of FIGURE_DEFINITIONS) lines.push(line('Definition: ' + definition.term, definition.meaning));
  for (const note of input.notes || []) lines.push(line('Note', note));

  lines.push('');
  lines.push(input.columns.map((column) => csvCell(column.label)).join(','));
  for (const row of input.rows) {
    lines.push(input.columns.map((column) => csvCell(row[column.key], column.type)).join(','));
  }
  if (input.totals) {
    lines.push(input.columns.map((column) => csvCell(input.totals![column.key], column.type)).join(','));
  }
  return lines.join('\r\n');
}

export function exportFilename(name: string, rangeLabel: string, extension = 'csv'): string {
  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const range = /^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/.test(rangeLabel) ? rangeLabel.replace(' to ', '_to_') : istDay();
  return `mookalaa-${slug(name)}-${range}.${extension}`;
}

export function csvDownload(csv: string, filename: string) {
  return new NextResponse('﻿' + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
