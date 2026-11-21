import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, csvResponse, escapeRegex, fail, ok, toCsv } from '@/lib/http';
import { payeeBalance, roundMoney, SERVICES, type Service } from '@/lib/ledger';
import { dueDateFor, getFinanceSettings, settlementRuleFor, type SettlementRule } from '../settings/store';
import {
  PAYEE_TYPES,
  SETTLEMENT_STATUSES,
  collectPeriodEntries,
  openSettlementTotal,
  payeeNameOf,
  serialiseDoc,
} from './shared';

export const dynamic = 'force-dynamic';

const EXPORT_COLUMNS = [
  { key: '_id', label: 'Settlement ID' },
  { key: 'status', label: 'Status' },
  { key: 'payeeType', label: 'Payee type' },
  { key: 'payeeName', label: 'Payee' },
  { key: 'payeeId', label: 'Payee ID' },
  { key: 'service', label: 'Service' },
  { key: 'periodFrom', label: 'Period from' },
  { key: 'periodTo', label: 'Period to' },
  { key: 'grossAmount', label: 'Gross' },
  { key: 'commissionAmount', label: 'Commission' },
  { key: 'gstAmount', label: 'GST' },
  { key: 'gatewayFeeAmount', label: 'Gateway fees' },
  { key: 'refundsAmount', label: 'Refunds' },
  { key: 'netAmount', label: 'Net payable' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'firstApprover', label: 'First approver' },
  { key: 'secondApprover', label: 'Second approver' },
  { key: 'bankReference', label: 'Bank reference' },
  { key: 'paidAt', label: 'Paid at' },
  { key: 'notes', label: 'Notes' },
  { key: 'createdAt', label: 'Created' },
];

/** Every payee with entries in the ledger and what they are owed. */
async function balances(db: Db) {
  const payees = await db
    .collection('transactions')
    .aggregate([
      { $match: { payeeId: { $nin: [null, ''] }, payeeType: { $in: [...PAYEE_TYPES] } } },
      {
        $group: {
          _id: { type: '$payeeType', id: '$payeeId' },
          name: { $max: '$payeeName' },
          lastEntryAt: { $max: '$createdAt' },
          entries: { $sum: 1 },
        },
      },
      { $sort: { lastEntryAt: -1 } },
      { $limit: 1000 },
    ])
    .toArray();

  const rows = [];
  for (const payee of payees) {
    const payeeType = String(payee._id.type);
    const payeeId = String(payee._id.id);
    const [balance, inSettlement, name] = await Promise.all([
      payeeBalance(db, payeeType, payeeId),
      openSettlementTotal(db, payeeType, payeeId),
      payeeNameOf(db, payeeType, payeeId, payee.name),
    ]);
    rows.push({
      payeeType,
      payeeId,
      payeeName: name,
      entries: payee.entries,
      lastEntryAt: payee.lastEntryAt,
      ...balance,
      inSettlement,
      available: roundMoney(balance.pending - inSettlement),
    });
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'settlements:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;
    const settings = await getFinanceSettings(db);
    const permissions = {
      canManage: can(check.admin, 'settlements:manage'),
      canApprove: can(check.admin, 'settlements:approve'),
    };

    if (params.get('view') === 'balances') {
      const rows = await balances(db);
      if (params.get('export') === 'csv') {
        await logAudit({
          admin: check.admin,
          action: 'export',
          module: 'settlements',
          entityType: 'payee-balances',
          meta: { rows: rows.length },
          request,
        });
        return csvResponse(
          toCsv(rows, [
            { key: 'payeeType', label: 'Payee type' },
            { key: 'payeeName', label: 'Payee' },
            { key: 'payeeId', label: 'Payee ID' },
            { key: 'gross', label: 'Gross' },
            { key: 'commission', label: 'Commission' },
            { key: 'gst', label: 'GST' },
            { key: 'gatewayFee', label: 'Gateway fees' },
            { key: 'refunds', label: 'Refunds' },
            { key: 'earned', label: 'Earned' },
            { key: 'settled', label: 'Settled' },
            { key: 'pending', label: 'Pending' },
            { key: 'inSettlement', label: 'In open settlements' },
            { key: 'available', label: 'Available to settle' },
          ]),
          `payee-balances-${new Date().toISOString().slice(0, 10)}.csv`
        );
      }
      return ok({ balances: rows, settings, ...permissions });
    }

    const filter: Record<string, any> = {};
    const status = params.get('status') || '';
    if ((SETTLEMENT_STATUSES as readonly string[]).includes(status)) filter.status = status;
    const payeeType = params.get('payeeType') || '';
    if ((PAYEE_TYPES as readonly string[]).includes(payeeType)) filter.payeeType = payeeType;
    const payeeId = (params.get('payeeId') || '').trim().slice(0, 64);
    if (payeeId) filter.payeeId = payeeId;

    const q = (params.get('q') || '').trim().slice(0, 100);
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' };
      filter.$or = [{ payeeName: regex }, { payeeId: regex }, { bankReference: regex }, { notes: regex }];
    }

    const collection = db.collection('settlements');
    const projection = { entryReferences: 0 };

    if (params.get('export') === 'csv') {
      const rows = await collection.find(filter, { projection }).sort({ createdAt: -1 }).limit(5000).toArray();
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'settlements',
        entityType: 'settlement',
        meta: { rows: rows.length, filter: Object.keys(filter) },
        request,
      });
      return csvResponse(
        toCsv(rows.map(serialiseDoc), EXPORT_COLUMNS),
        `settlements-${new Date().toISOString().slice(0, 10)}.csv`
      );
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(params.get('limit') || '25', 10) || 25));

    const [items, total, grouped] = await Promise.all([
      collection.find(filter, { projection }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
      collection.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$netAmount' } } }]).toArray(),
    ]);

    return ok({
      items: items.map(serialiseDoc),
      total,
      page,
      limit,
      statusCounts: Object.fromEntries(grouped.map((g) => [String(g._id), g.count])),
      statusAmounts: Object.fromEntries(grouped.map((g) => [String(g._id), roundMoney(g.amount || 0)])),
      settings,
      ...permissions,
    });
  } catch (error) {
    console.error('List settlements failed:', error);
    return fail('Failed to load the settlements', 500);
  }
}

const IST_OFFSET_MS = 330 * 60000;

function parseDay(value: unknown, endOfDay: boolean): Date | null {
  const text = asString(value, 40);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  // A plain date means the whole day in India time, the same days the statements use.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
    else date.setUTCHours(0, 0, 0, 0);
    return new Date(date.getTime() - IST_OFFSET_MS);
  }
  return date;
}

/**
 * POST { payeeType, payeeId, periodFrom, periodTo, service?, notes?, preview? }
 *
 * Creates a settlement. Every amount is worked out here from the ledger; no
 * amount is accepted from the caller. With `preview: true` the amounts are
 * returned and nothing is stored.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'settlements:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const payeeType = asString(body.payeeType, 20);
    if (!(PAYEE_TYPES as readonly string[]).includes(payeeType)) return fail('Choose the payee');
    const payeeId = asString(body.payeeId, 64);
    if (!payeeId) return fail('Choose the payee');

    const from = parseDay(body.periodFrom, false);
    const to = parseDay(body.periodTo, true);
    if (!from || !to) return fail('The period needs a valid start and end date');
    if (from.getTime() > to.getTime()) return fail('The period start must be before its end');

    const serviceInput = asString(body.service, 40);
    if (serviceInput && !SERVICES.some((s) => s.value === serviceInput)) return fail('Unknown service');
    const service = (serviceInput || null) as Service | null;
    const notes = asString(body.notes, 2000);

    const { db } = await connectToDatabase();
    const settings = await getFinanceSettings(db);

    const period = await collectPeriodEntries(db, {
      payeeType,
      payeeId,
      from,
      to,
      service,
      eligibilityDaysFor: (entryService) => settlementRuleFor(settings, entryService).eligibilityDays,
    });

    const [balance, inSettlement] = await Promise.all([
      payeeBalance(db, payeeType, payeeId),
      openSettlementTotal(db, payeeType, payeeId),
    ]);
    const available = roundMoney(balance.pending - inSettlement);
    const net = period.totals.netAmount;

    let problem: string | null = null;
    if (balance.gross === 0 && balance.refunds === 0 && balance.settled === 0) {
      problem = 'This payee has no entries in the ledger.';
    } else if (period.entries.length === 0) {
      problem =
        period.alreadySettled > 0
          ? 'Every ledger entry in this period is already covered by another settlement.'
          : period.heldBackCount > 0
            ? 'The entries in this period belong to events that are still inside the settlement eligibility wait of their service.'
            : 'There are no ledger entries for this payee in this period.';
    } else if (net <= 0) {
      problem = 'Nothing is payable for this period: charges and refunds are equal to or more than the payments.';
    } else if (net > available) {
      problem =
        `This settlement (₹${net}) is larger than the payee's pending balance available to settle (₹${available}). ` +
        'Refunds dated after the period, or other open settlements, have reduced what is owed. Choose a period that includes them.';
    }

    // The settlement rule of every service this settlement pays for. With
    // several services the payout is due on the earliest of their due dates.
    const servicesCovered = Array.from(new Set(period.entries.map((e) => String(e.service))));
    const ruleServices = servicesCovered.length ? servicesCovered : service ? [service] : [];
    const rulesApplied: (SettlementRule & { dueDate: Date | null })[] = ruleServices.map((value) => {
      const rule = settlementRuleFor(settings, value);
      return { ...rule, dueDate: dueDateFor(to, rule.payoutSchedule) };
    });
    const dueDates = rulesApplied.map((r) => r.dueDate).filter(Boolean) as Date[];
    const dueDate = dueDates.length ? new Date(Math.min(...dueDates.map((d) => d.getTime()))) : null;
    const schedules = Array.from(new Set(rulesApplied.map((r) => r.payoutSchedule)));

    const summary = {
      ...period.totals,
      entryCount: period.entries.length,
      alreadySettled: period.alreadySettled,
      heldBackCount: period.heldBackCount,
      heldBackNet: period.heldBackNet,
      pendingBalance: balance.pending,
      inOpenSettlements: inSettlement,
      availableToSettle: available,
      dueDate,
      payoutSchedule: schedules.length === 1 ? schedules[0] : schedules.length === 0 ? settings.payoutSchedule : 'mixed',
      rulesApplied,
    };

    if (body.preview === true) return ok({ preview: summary, problem });
    if (problem) return fail(problem, 409, { preview: summary });

    const services = servicesCovered;
    const now = new Date();
    const doc = {
      payeeType,
      payeeId,
      payeeName: await payeeNameOf(db, payeeType, payeeId, period.entries.find((e) => e.payeeName)?.payeeName),
      service: service || (services.length === 1 ? services[0] : 'mixed'),
      // The settlement's own ledger entry needs one service; a mixed settlement uses the first.
      ledgerService: service || services[0],
      periodFrom: from,
      periodTo: to,
      periodTimezone: 'Asia/Kolkata',
      ...period.totals,
      entryCount: period.entries.length,
      entryReferences: period.entries.map((e) => String(e.reference)),
      dueDate: summary.dueDate,
      // The settlement rules as they stood when this settlement was created.
      rulesApplied,
      bankReference: null,
      notes: notes || null,
      status: 'pending',
      firstApprover: null,
      secondApprover: null,
      paidAt: null,
      createdBy: check.admin.email || null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('settlements').insertOne(doc);

    const { entryReferences, ...forLog } = doc;
    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'settlements',
      entityType: 'settlement',
      entityId: String(result.insertedId),
      entityLabel: doc.payeeName || payeeId,
      after: forLog,
      reason: notes || null,
      request,
    });

    return ok({ id: String(result.insertedId), item: serialiseDoc({ ...forLog, _id: result.insertedId }) }, { status: 201 });
  } catch (error) {
    console.error('Create settlement failed:', error);
    return fail('Failed to create the settlement', 500);
  }
}
