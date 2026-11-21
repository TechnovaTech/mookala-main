import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { roundMoney } from '@/lib/ledger';
import { REPORT_TIMEZONE_LABEL } from '@/lib/resources/reports';
import { buildExportCsv, csvDownload, exportFilename, istDay, resolveRange, type ColumnType, type DateRange } from '@/lib/reporting';
import { DAY_MS, daysUntil, effectiveStatus, sweepExpired, todayStart } from '@/lib/resources/memberships.hooks';
import { PAYMENTS, SUBSCRIPTIONS, amountOf, linkLedgerEntries, planNames, revenueFigures } from '../_lib/data';

export const dynamic = 'force-dynamic';

/**
 * Membership reports.
 *   GET ?report=revenue|renewals|expiries|cancellations&from=YYYY-MM-DD&to=YYYY-MM-DD
 *       &export=csv&table=<table key>     downloads one table (audited)
 *
 * Ranges are whole days in India time. Each report also returns "checks": the
 * same figure counted a second way from another source (the finance ledger or
 * the activity log), so a difference is visible instead of hidden.
 */

interface Column {
  key: string;
  label: string;
  type: ColumnType;
}
interface Table {
  key: string;
  title: string;
  description: string;
  columns: Column[];
  rows: Record<string, any>[];
  totals?: Record<string, any> | null;
  emptyTitle: string;
}
interface Check {
  label: string;
  report: number;
  independent: number;
  source: string;
  type: ColumnType;
  match: boolean;
}
interface Report {
  key: string;
  name: string;
  basis: string;
  summary: { label: string; value: number | null; type: ColumnType }[];
  checks: Check[];
  tables: Table[];
  notes: string[];
}

const col = (key: string, label: string, type: ColumnType = 'text'): Column => ({ key, label, type });
const ROW_LIMIT = 5000;

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  expired: 'Expired',
  cancelled: 'Cancelled',
  payment_failed: 'Payment failed',
  paused: 'Paused',
};

function check(label: string, report: number, independent: number, source: string, type: ColumnType = 'number'): Check {
  return { label, report, independent, source, type, match: roundMoney(report) === roundMoney(independent) };
}

function percent(part: number, whole: number): number | null {
  return whole ? Math.round((part / whole) * 1000) / 10 : null;
}

/** Calendar-day fields (expiry, period) are stored as midnight UTC of the day. */
function dayBounds(range: DateRange) {
  return { from: new Date(range.from + 'T00:00:00.000Z'), to: new Date(range.to + 'T00:00:00.000Z') };
}

const calendarDay = (value: any) => (value ? new Date(value).toISOString().slice(0, 10) : '');

/* ------------------------------ revenue ------------------------------ */

async function revenueReport(db: Db, range: DateRange): Promise<Report> {
  const between = { $gte: range.start, $lt: range.end };
  const byDay = range.days <= 62;
  const bucket = (value: any) => istDay(new Date(value)).slice(0, byDay ? 10 : 7);

  const [paid, refunded, ledger, figures] = await Promise.all([
    db.collection(PAYMENTS).find({ status: { $in: ['paid', 'refunded'] }, paidRecordedAt: between }).limit(50_000).toArray(),
    db.collection(PAYMENTS).find({ status: 'refunded', refundRecordedAt: between }).limit(50_000).toArray(),
    db
      .collection('transactions')
      .find({ service: 'membership', status: 'success', type: { $in: ['payment', 'refund'] }, createdAt: between })
      .project({ type: 1, amount: 1, createdAt: 1 })
      .limit(100_000)
      .toArray(),
    revenueFigures(db, range),
  ]);
  const names = await planNames(db, [...paid, ...refunded]);

  const periods = new Map<string, Record<string, any>>();
  const periodRow = (key: string) => {
    if (!periods.has(key)) {
      periods.set(key, { period: key, payments: 0, gross: 0, refunds: 0, net: 0, ledgerGross: 0, ledgerRefunds: 0, ledgerNet: 0 });
    }
    return periods.get(key)!;
  };
  const plans = new Map<string, Record<string, any>>();
  const planRow = (payment: any) => {
    const name = payment.planName || names.get(String(payment.plan)) || 'Plan not recorded';
    if (!plans.has(name)) plans.set(name, { plan: name, payments: 0, gross: 0, refundCount: 0, refunds: 0, net: 0 });
    return plans.get(name)!;
  };

  for (const payment of paid) {
    const amount = amountOf(payment.amount);
    const p = periodRow(bucket(payment.paidRecordedAt));
    p.payments += 1;
    p.gross += amount;
    const q = planRow(payment);
    q.payments += 1;
    q.gross += amount;
  }
  for (const payment of refunded) {
    const amount = amountOf(payment.amount);
    periodRow(bucket(payment.refundRecordedAt)).refunds += amount;
    const q = planRow(payment);
    q.refundCount += 1;
    q.refunds += amount;
  }
  for (const entry of ledger) {
    const p = periodRow(bucket(entry.createdAt));
    if (entry.type === 'payment') p.ledgerGross += amountOf(entry.amount);
    else p.ledgerRefunds += amountOf(entry.amount);
  }

  const money = ['gross', 'refunds', 'net', 'ledgerGross', 'ledgerRefunds', 'ledgerNet'];
  const finish = (row: Record<string, any>) => {
    row.net = row.gross - row.refunds;
    if ('ledgerGross' in row) row.ledgerNet = row.ledgerGross - row.ledgerRefunds;
    for (const key of money) if (key in row) row[key] = roundMoney(row[key]);
    return row;
  };
  const periodRows = [...periods.values()].map(finish).sort((a, b) => a.period.localeCompare(b.period));
  const planRows = [...plans.values()].map(finish).sort((a, b) => b.gross - a.gross);

  const { documents, ledger: fromLedger } = figures;
  return {
    key: 'revenue',
    name: 'Membership revenue',
    basis: 'The range is applied to the moment a payment (or its refund) was entered in the finance ledger, which is the date the dashboard and the Finance screens use. The payment date typed on the record can be earlier.',
    summary: [
      { label: 'Membership revenue (payments received)', value: documents.gross, type: 'money' },
      { label: 'Paid payments', value: documents.payments, type: 'number' },
      { label: 'Refunds', value: documents.refunds, type: 'money' },
      { label: 'Revenue less refunds', value: documents.net, type: 'money' },
    ],
    checks: [
      check('Membership revenue', documents.gross, fromLedger.gross, "Finance ledger: 'payment' entries for the membership service", 'money'),
      check('Paid payments', documents.payments, fromLedger.payments, "Finance ledger: number of 'payment' entries"),
      check('Refunds', documents.refunds, fromLedger.refunds, "Finance ledger: 'refund' entries for the membership service", 'money'),
      check('Revenue less refunds', documents.net, fromLedger.net, 'Finance ledger: payments less refunds', 'money'),
      check(
        'Membership revenue, payment records only',
        documents.gross,
        roundMoney(fromLedger.gross - figures.ledgerOther.gross),
        'Finance ledger: only the entries written for these payment records',
        'money'
      ),
    ],
    tables: [
      {
        key: 'period',
        title: byDay ? 'Revenue by day' : 'Revenue by month',
        description: 'Payment records beside the ledger entries for the same period.',
        columns: [
          col('period', byDay ? 'Day' : 'Month'),
          col('payments', 'Paid payments', 'number'),
          col('gross', 'Revenue (payment records)', 'money'),
          col('ledgerGross', 'Revenue (ledger)', 'money'),
          col('refunds', 'Refunds (payment records)', 'money'),
          col('ledgerRefunds', 'Refunds (ledger)', 'money'),
          col('net', 'Revenue less refunds', 'money'),
        ],
        rows: periodRows,
        totals: {
          period: 'Total',
          payments: documents.payments,
          gross: documents.gross,
          ledgerGross: fromLedger.gross,
          refunds: documents.refunds,
          ledgerRefunds: fromLedger.refunds,
          net: documents.net,
        },
        emptyTitle: 'No membership payment was entered in this range.',
      },
      {
        key: 'plan',
        title: 'Revenue by plan',
        description: 'Grouped by the plan name stored on each payment on the day it was recorded. The ledger does not hold the plan, so this table comes from the payment records only.',
        columns: [
          col('plan', 'Plan'),
          col('payments', 'Paid payments', 'number'),
          col('gross', 'Revenue', 'money'),
          col('refundCount', 'Refunded payments', 'number'),
          col('refunds', 'Refunds', 'money'),
          col('net', 'Revenue less refunds', 'money'),
        ],
        rows: planRows,
        totals: {
          plan: 'Total',
          payments: documents.payments,
          gross: documents.gross,
          refundCount: documents.refundCount,
          refunds: documents.refunds,
          net: documents.net,
        },
        emptyTitle: 'No membership payment was entered in this range.',
      },
    ],
    notes: [
      'Membership payments are entered by the team; they are not taken or verified through the payment gateway.',
      ...(figures.ledgerOther.payments > 0
        ? [
            `The ledger figure includes ${figures.ledgerOther.payments} membership payment entr${figures.ledgerOther.payments === 1 ? 'y' : 'ies'} worth ₹${figures.ledgerOther.gross.toLocaleString('en-IN')} that were not written for a payment record on the Membership Payments screen (entered in the ledger some other way). The dashboard and Finance count them; the payment records cannot.`,
          ]
        : []),
      ...(figures.missingFromLedger > 0
        ? [`${figures.missingFromLedger} paid payment record(s) created in this range have no ledger entry and are not counted in either figure.`]
        : []),
    ],
  };
}

/* ------------------------------ renewals ----------------------------- */

async function renewalsReport(db: Db, range: DateRange): Promise<Report> {
  const { from, to } = dayBounds(range);
  const today = todayStart();
  const yesterday = new Date(today.getTime() - DAY_MS);
  const pastTo = to.getTime() < yesterday.getTime() ? to : yesterday;

  const [renewals, lapsed, upcoming] = await Promise.all([
    db
      .collection(PAYMENTS)
      .find({ kind: 'renewal', status: 'paid', 'effect.extended': true, 'effect.previousExpiresOn': { $gte: from, $lte: to } })
      .limit(ROW_LIMIT)
      .toArray(),
    pastTo.getTime() >= from.getTime()
      ? db.collection(SUBSCRIPTIONS).find({ expiresOn: { $gte: from, $lte: pastTo } }).limit(ROW_LIMIT).toArray()
      : [],
    to.getTime() >= today.getTime()
      ? db
          .collection(SUBSCRIPTIONS)
          .find({ expiresOn: { $gte: from.getTime() > today.getTime() ? from : today, $lte: to }, status: { $ne: 'cancelled' } })
          .limit(ROW_LIMIT)
          .toArray()
      : [],
  ]);
  const names = await planNames(db, [...renewals, ...lapsed, ...upcoming]);

  const paymentIds = renewals.map((p) => String(p._id));
  const [auditCount, ledgerRows] = await Promise.all([
    paymentIds.length
      ? db.collection('auditLogs').countDocuments({ action: 'renewal', entityType: 'membership-subscriptions', 'meta.paymentId': { $in: paymentIds } })
      : 0,
    paymentIds.length
      ? db
          .collection('transactions')
          .find({ type: 'payment', 'meta.recordKey': { $in: paymentIds.map((id) => `membership-payment:${id}`) } })
          .project({ amount: 1 })
          .toArray()
      : [],
  ]);

  const rows: Record<string, any>[] = [];
  for (const payment of renewals) {
    rows.push({
      member: payment.memberName || '',
      phone: payment.memberPhone || '',
      plan: payment.planName || names.get(String(payment.plan)) || '',
      termEnded: calendarDay(payment.effect.previousExpiresOn),
      outcome: 'Renewed',
      amount: amountOf(payment.amount),
      renewedOn: payment.paidRecordedAt || payment.createdAt,
      newExpiry: calendarDay(payment.effect.newExpiresOn),
    });
  }
  for (const subscription of lapsed) {
    const status = effectiveStatus(subscription, today);
    rows.push({
      member: subscription.memberName || '',
      phone: subscription.memberPhone || '',
      plan: names.get(String(subscription.plan)) || subscription.planName || '',
      termEnded: calendarDay(subscription.expiresOn),
      outcome: `Lapsed (${(STATUS_LABEL[status] || status).toLowerCase()})`,
      amount: null,
      renewedOn: null,
      newExpiry: '',
    });
  }
  for (const subscription of upcoming) {
    rows.push({
      member: subscription.memberName || '',
      phone: subscription.memberPhone || '',
      plan: names.get(String(subscription.plan)) || subscription.planName || '',
      termEnded: calendarDay(subscription.expiresOn),
      outcome: 'Not due yet',
      amount: null,
      renewedOn: null,
      newExpiry: '',
    });
  }
  rows.sort((a, b) => a.termEnded.localeCompare(b.termEnded));

  const months = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const key = row.termEnded.slice(0, 7);
    if (!months.has(key)) months.set(key, { month: key, renewed: 0, lapsed: 0, notDue: 0, rate: null });
    const m = months.get(key)!;
    if (row.outcome === 'Renewed') m.renewed += 1;
    else if (row.outcome === 'Not due yet') m.notDue += 1;
    else m.lapsed += 1;
  }
  const monthRows = [...months.values()]
    .map((m): Record<string, any> => ({ ...m, rate: percent(m.renewed, m.renewed + m.lapsed) }))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));

  const renewedValue = roundMoney(renewals.reduce((total, p) => total + amountOf(p.amount), 0));
  const ledgerValue = roundMoney(ledgerRows.reduce((total, row) => total + amountOf(row.amount), 0));

  return {
    key: 'renewals',
    name: 'Membership renewals',
    basis: 'Counts membership periods whose last day (the expiry date before any renewal) falls in the range. A period is "renewed" when a paid renewal payment moved the expiry date on from that day, "lapsed" when that day has passed with no renewal, and "not due yet" when the day is today or later.',
    summary: [
      { label: 'Renewed', value: renewals.length, type: 'number' },
      { label: 'Lapsed', value: lapsed.length, type: 'number' },
      { label: 'Renewal rate (renewed out of renewed and lapsed)', value: percent(renewals.length, renewals.length + lapsed.length), type: 'percent' },
      { label: 'Not due yet', value: upcoming.length, type: 'number' },
      { label: 'Value of renewal payments', value: renewedValue, type: 'money' },
    ],
    checks: [
      check('Renewed', renewals.length, auditCount, "Activity log: 'renewal' entries written for these payments"),
      check('Value of renewal payments', renewedValue, ledgerValue, 'Finance ledger: the payment entries of these renewals', 'money'),
    ],
    tables: [
      {
        key: 'month',
        title: 'Renewed and lapsed by month',
        description: 'Grouped by the month in which the membership period ended.',
        columns: [
          col('month', 'Month the period ended'),
          col('renewed', 'Renewed', 'number'),
          col('lapsed', 'Lapsed', 'number'),
          col('rate', 'Renewal rate', 'percent'),
          col('notDue', 'Not due yet', 'number'),
        ],
        rows: monthRows,
        totals: {
          month: 'Total',
          renewed: renewals.length,
          lapsed: lapsed.length,
          rate: percent(renewals.length, renewals.length + lapsed.length),
          notDue: upcoming.length,
        },
        emptyTitle: 'No membership period ends in this range.',
      },
      {
        key: 'list',
        title: 'Membership periods ending in the range',
        description: 'One row per membership period, with what happened to it.',
        columns: [
          col('member', 'Member'),
          col('phone', 'Phone'),
          col('plan', 'Plan'),
          col('termEnded', 'Period ended'),
          col('outcome', 'Outcome'),
          col('amount', 'Renewal amount', 'money'),
          col('renewedOn', 'Renewal entered at', 'datetime'),
          col('newExpiry', 'New expiry date'),
        ],
        rows,
        emptyTitle: 'No membership period ends in this range.',
      },
    ],
    notes: [
      'A renewal that was later refunded is not counted as renewed: the refund puts the expiry date back, so the period shows as lapsed.',
      'Renewals happen only when the team records a payment. Nothing charges a member automatically.',
    ],
  };
}

/* ------------------------------ expiries ----------------------------- */

async function expiriesReport(db: Db, range: DateRange): Promise<Report> {
  const { from, to } = dayBounds(range);
  const today = todayStart();
  const filter = { expiresOn: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } };
  const [found, recount] = await Promise.all([
    db.collection(SUBSCRIPTIONS).find(filter).sort({ expiresOn: 1 }).limit(ROW_LIMIT).toArray(),
    // Counted again in the database, split at today, instead of from the listed rows.
    Promise.all([
      db.collection(SUBSCRIPTIONS).countDocuments({ status: { $ne: 'cancelled' }, expiresOn: { $gte: from, $lte: to, $lt: today } }),
      db.collection(SUBSCRIPTIONS).countDocuments({ status: { $ne: 'cancelled' }, $and: [{ expiresOn: { $gte: from, $lte: to } }, { expiresOn: { $gte: today } }] }),
    ]),
  ]);
  const names = await planNames(db, found);

  const months = new Map<string, Record<string, any>>();
  const rows = found.map((subscription) => {
    const days = daysUntil(subscription.expiresOn, today) ?? 0;
    const expired = days < 0;
    const key = calendarDay(subscription.expiresOn).slice(0, 7);
    if (!months.has(key)) months.set(key, { month: key, expired: 0, expiring: 0, total: 0 });
    const m = months.get(key)!;
    if (expired) m.expired += 1;
    else m.expiring += 1;
    m.total += 1;
    const status = effectiveStatus(subscription, today);
    return {
      member: subscription.memberName || '',
      phone: subscription.memberPhone || '',
      plan: names.get(String(subscription.plan)) || subscription.planName || '',
      expiresOn: calendarDay(subscription.expiresOn),
      state: expired ? 'Expired' : 'Expiring',
      status: STATUS_LABEL[status] || status,
      days: Math.abs(days),
      daysLabel: expired ? `${Math.abs(days)} day(s) ago` : days === 0 ? 'Today' : `In ${days} day(s)`,
      lastReminderAt: subscription.lastReminderAt || null,
    };
  });
  const expired = rows.filter((row) => row.state === 'Expired').length;
  const expiring = rows.length - expired;

  return {
    key: 'expiries',
    name: 'Membership expiries',
    basis: `Subscriptions whose expiry date falls in the range, by month. "Expired" means the date is before today (${istDay()} in India); "expiring" means it is today or later. Cancelled subscriptions are left out (see the cancellations report). A subscription that was renewed has a later expiry date and appears under that date.`,
    summary: [
      { label: 'Expired', value: expired, type: 'number' },
      { label: 'Expiring', value: expiring, type: 'number' },
      { label: 'Total', value: rows.length, type: 'number' },
    ],
    checks: [
      check('Expired', expired, recount[0], 'Subscription records counted again with a separate query'),
      check('Expiring', expiring, recount[1], 'Subscription records counted again with a separate query'),
    ],
    tables: [
      {
        key: 'month',
        title: 'Expired and expiring by month',
        description: 'Grouped by the month of the expiry date.',
        columns: [col('month', 'Month'), col('expired', 'Expired', 'number'), col('expiring', 'Expiring', 'number'), col('total', 'Total', 'number')],
        rows: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
        totals: { month: 'Total', expired, expiring, total: rows.length },
        emptyTitle: 'No subscription has an expiry date in this range.',
      },
      {
        key: 'list',
        title: 'Subscriptions with an expiry date in the range',
        description: 'The status is the one the subscription has today.',
        columns: [
          col('member', 'Member'),
          col('phone', 'Phone'),
          col('plan', 'Plan'),
          col('expiresOn', 'Expires on'),
          col('state', 'Expired or expiring'),
          col('daysLabel', 'When'),
          col('status', 'Status today'),
          col('lastReminderAt', 'Last reminder', 'datetime'),
        ],
        rows,
        emptyTitle: 'No subscription has an expiry date in this range.',
      },
    ],
    notes: [],
  };
}

/* ---------------------------- cancellations -------------------------- */

async function cancellationsReport(db: Db, range: DateRange): Promise<Report> {
  const between = { $gte: range.start, $lt: range.end };
  const [found, auditIds] = await Promise.all([
    db
      .collection(SUBSCRIPTIONS)
      .find({
        $or: [
          { cancelledAt: between },
          // Cancelled before the cancellation time was stored separately.
          { cancelledAt: { $exists: false }, status: 'cancelled', statusChangedAt: between },
        ],
      })
      .limit(ROW_LIMIT)
      .toArray(),
    db.collection('auditLogs').distinct('entityId', { entityType: 'membership-subscriptions', 'after.status': 'cancelled', createdAt: between }),
  ]);
  const names = await planNames(db, found);
  const today = todayStart();

  const reasons = new Map<string, number>();
  const months = new Map<string, number>();
  const rows = found
    .map((subscription) => {
      const at = subscription.cancelledAt || subscription.statusChangedAt;
      const reason = String(subscription.cancelReason || subscription.statusReason || '').trim() || 'No reason recorded';
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
      const month = istDay(new Date(at)).slice(0, 7);
      months.set(month, (months.get(month) || 0) + 1);
      const status = effectiveStatus(subscription, today);
      return {
        member: subscription.memberName || '',
        phone: subscription.memberPhone || '',
        plan: names.get(String(subscription.plan)) || subscription.planName || '',
        cancelledAt: at,
        cancelledBy: subscription.cancelledBy || subscription.statusChangedBy || '',
        reason,
        status: status === 'cancelled' ? 'Cancelled' : `Reinstated (${(STATUS_LABEL[status] || status).toLowerCase()})`,
        expiresOn: calendarDay(subscription.expiresOn),
      };
    })
    .sort((a, b) => new Date(b.cancelledAt).getTime() - new Date(a.cancelledAt).getTime());
  const stillCancelled = rows.filter((row) => row.status === 'Cancelled').length;

  return {
    key: 'cancellations',
    name: 'Membership cancellations',
    basis: 'Subscriptions whose latest cancellation was made in the range (India time), with the reason given. A subscription reinstated afterwards is still listed, marked as reinstated.',
    summary: [
      { label: 'Cancellations', value: rows.length, type: 'number' },
      { label: 'Still cancelled', value: stillCancelled, type: 'number' },
      { label: 'Reinstated since', value: rows.length - stillCancelled, type: 'number' },
    ],
    checks: [
      check('Cancellations', rows.length, auditIds.length, 'Activity log: subscriptions with a change to "cancelled" in the range'),
    ],
    tables: [
      {
        key: 'reason',
        title: 'Cancellations by reason',
        description: 'The reason is the text the admin typed when cancelling.',
        columns: [col('reason', 'Reason'), col('count', 'Cancellations', 'number')],
        rows: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
        totals: { reason: 'Total', count: rows.length },
        emptyTitle: 'No subscription was cancelled in this range.',
      },
      {
        key: 'month',
        title: 'Cancellations by month',
        description: '',
        columns: [col('month', 'Month'), col('count', 'Cancellations', 'number')],
        rows: [...months.entries()].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
        totals: { month: 'Total', count: rows.length },
        emptyTitle: 'No subscription was cancelled in this range.',
      },
      {
        key: 'list',
        title: 'Cancelled subscriptions',
        description: '',
        columns: [
          col('member', 'Member'),
          col('phone', 'Phone'),
          col('plan', 'Plan'),
          col('cancelledAt', 'Cancelled at', 'datetime'),
          col('cancelledBy', 'Cancelled by'),
          col('reason', 'Reason'),
          col('status', 'Status today'),
          col('expiresOn', 'Expiry date'),
        ],
        rows,
        emptyTitle: 'No subscription was cancelled in this range.',
      },
    ],
    notes: [
      'A subscription cancelled more than once appears once, under its latest cancellation. The activity log check counts subscriptions, not log entries, so the two agree unless a subscription was cancelled in the range and cancelled again later.',
    ],
  };
}

const BUILDERS: Record<string, (db: Db, range: DateRange) => Promise<Report>> = {
  revenue: revenueReport,
  renewals: renewalsReport,
  expiries: expiriesReport,
  cancellations: cancellationsReport,
};

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'memberships:view');
  if (!admin.ok) return admin.response;

  const params = request.nextUrl.searchParams;
  const key = params.get('report') || 'revenue';
  const build = BUILDERS[key];
  if (!build) return fail('Unknown report. Use revenue, renewals, expiries or cancellations.');

  const range = resolveRange(params, 'month');
  if (typeof range === 'string') return fail(range);

  try {
    const { db } = await connectToDatabase();
    await sweepExpired(db, { admin: admin.admin, request, via: 'on-read' });
    await linkLedgerEntries(db);
    const report = await build(db, range);

    if (params.get('export') === 'csv') {
      const table = report.tables.find((t) => t.key === params.get('table')) || report.tables[0];
      const name = `${report.name}: ${table.title}`;
      await logAudit({
        admin: admin.admin,
        action: 'export',
        module: 'memberships',
        entityType: 'membership-report',
        entityLabel: name,
        meta: { report: report.key, table: table.key, from: range.from, to: range.to, timezone: 'Asia/Kolkata', rows: table.rows.length },
        request,
      });
      const csv = buildExportCsv({
        name,
        rangeLabel: range.label,
        generatedBy: admin.admin.email || null,
        columns: table.columns,
        rows: table.rows,
        totals: table.totals || null,
        summary: [
          ...report.summary.map((item) => ({ label: item.label, value: item.value ?? '', type: item.type })),
          ...report.checks.map((item) => ({ label: `Check, ${item.label}: ${item.source}`, value: item.independent, type: item.type })),
        ],
        notes: [report.basis, ...report.notes],
      });
      return csvDownload(csv, exportFilename(name, range.label));
    }

    return ok({
      ...report,
      range: { from: range.from, to: range.to, label: range.label, days: range.days },
      timezone: REPORT_TIMEZONE_LABEL,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Membership report failed:', error);
    return fail('Failed to build the membership report', 500);
  }
}
