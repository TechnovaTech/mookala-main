import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { escapeRegex, fail, ok, parseAmount, toObjectId } from '@/lib/http';
import { SERVICES, roundMoney } from '@/lib/ledger';
import { expireStaleHolds, unverifiedTicketTotals } from '@/lib/bookings';
import {
  buildExportCsv,
  csvDownload,
  ensureIndexes,
  exportFilename,
  optionalCreatedAt,
  serviceLabel,
  type ReportColumn,
} from '@/lib/reporting';
import { displayStatus, paymentStateFilter, syncPaymentStates } from './shared';

export const dynamic = 'force-dynamic';

const STATUSES = ['success', 'failed', 'pending', 'refunded', 'disputed'];
const PAGE_SIZE = 25;
const EXPORT_LIMIT = 50_000;
const PENDING_CAP = 2000;

const EXPORT_COLUMNS: ReportColumn[] = [
  { key: 'createdAt', label: 'Date (IST)', type: 'datetime' },
  { key: 'reference', label: 'Reference', type: 'text' },
  { key: 'state', label: 'Status', type: 'text' },
  { key: 'service', label: 'Service', type: 'text' },
  { key: 'amount', label: 'Amount', type: 'money' },
  { key: 'refundedAmount', label: 'Refunded to customer', type: 'money' },
  { key: 'refundDeductions', label: 'Kept under refund rule', type: 'money' },
  { key: 'customerPhone', label: 'Customer phone', type: 'text' },
  { key: 'bookingId', label: 'Booking ID', type: 'text' },
  { key: 'eventId', label: 'Event ID', type: 'text' },
  { key: 'payeeType', label: 'Payee type', type: 'text' },
  { key: 'payeeName', label: 'Payee', type: 'text' },
  { key: 'gatewayOrderId', label: 'Gateway order ID', type: 'text' },
  { key: 'gatewayPaymentId', label: 'Gateway payment ID', type: 'text' },
  { key: 'gatewaySettlementId', label: 'Gateway settlement ID', type: 'text' },
  { key: 'gatewaySettlementUtr', label: 'Gateway settlement UTR', type: 'text' },
  { key: 'commissionRate', label: 'Commission rate % (rule applied)', type: 'percent' },
  { key: 'note', label: 'Note', type: 'text' },
];

/**
 * A pending payment is a booking that is awaiting payment against a gateway
 * order: seats held, order created, no money yet. It is read from `bookings`
 * (there is nothing to put in the ledger until money moves), after holds that
 * ran out have been expired, so an abandoned checkout leaves this list by
 * itself. Ledger entries with status 'pending', if any exist, are listed too.
 */
async function pendingPayments(
  db: Db,
  input: { service: string; q: string; createdAt: Record<string, Date> | null }
): Promise<Record<string, any>[]> {
  await expireStaleHolds(db);

  const ledgerFilter: Record<string, any> = { type: 'payment', status: 'pending' };
  if (input.service) ledgerFilter.service = input.service;
  if (input.createdAt) ledgerFilter.createdAt = input.createdAt;
  if (input.q) {
    const pattern = new RegExp(escapeRegex(input.q), 'i');
    ledgerFilter.$or = ['reference', 'gatewayPaymentId', 'gatewayOrderId', 'customerPhone', 'bookingId'].map((field) => ({ [field]: pattern }));
  }
  const fromLedger = await db.collection('transactions').find(ledgerFilter).sort({ createdAt: -1 }).limit(PENDING_CAP).toArray();

  let fromBookings: Record<string, any>[] = [];
  if (!input.service || input.service === 'ticketing') {
    const filter: Record<string, any> = { status: 'pending_payment', gatewayOrderId: { $type: 'string', $ne: '' } };
    if (input.createdAt) filter.createdAt = input.createdAt;
    if (input.q) {
      const pattern = new RegExp(escapeRegex(input.q), 'i');
      const or: Record<string, any>[] = [{ gatewayOrderId: pattern }, { userPhone: pattern }, { pendingGatewayPaymentId: pattern }, { _id: pattern }];
      const oid = toObjectId(input.q);
      if (oid) or.push({ _id: oid });
      filter.$or = or;
    }
    const bookings = await db
      .collection('bookings')
      .find(filter)
      .project({ userPhone: 1, eventId: 1, eventTitle: 1, totalPrice: 1, gatewayOrderId: 1, pendingGatewayPaymentId: 1, payeeType: 1, payeeId: 1, createdAt: 1, expiresAt: 1 })
      .sort({ createdAt: -1 })
      .limit(PENDING_CAP)
      .toArray();
    fromBookings = bookings.map((booking) => ({
      _id: 'booking:' + String(booking._id),
      source: 'booking',
      reference: null,
      type: 'payment',
      status: 'pending',
      service: 'ticketing',
      amount: roundMoney(parseAmount(booking.totalPrice)),
      customerPhone: booking.userPhone || null,
      bookingId: String(booking._id),
      eventId: booking.eventId || null,
      eventTitle: booking.eventTitle || null,
      payeeType: booking.payeeType || null,
      payeeId: booking.payeeId || null,
      gatewayOrderId: booking.gatewayOrderId,
      gatewayPaymentId: booking.pendingGatewayPaymentId || null,
      createdAt: booking.createdAt || null,
      expiresAt: booking.expiresAt || null,
      note: booking.pendingGatewayPaymentId
        ? 'The bank approved the payment; waiting for the gateway to capture it.'
        : 'Order created; waiting for the customer to pay.',
    }));
  }

  return [...fromBookings, ...fromLedger].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

/** Customer payments by state, with a count for each tab. */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  const status = (params.get('status') || 'success').trim();
  const service = (params.get('service') || '').trim();
  const q = (params.get('q') || '').trim().slice(0, 100);
  const wantsCsv = params.get('format') === 'csv';

  if (!STATUSES.includes(status)) return fail('Unknown payment status.');
  if (service && !SERVICES.some((s) => s.value === service)) return fail('Unknown service.');
  const dates = optionalCreatedAt(params);
  if (typeof dates === 'string') return fail(dates);

  const and: Record<string, any>[] = [{ type: 'payment' }];
  if (service) and.push({ service });
  if (dates.condition) and.push({ createdAt: dates.condition });
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    and.push({
      $or: ['reference', 'gatewayPaymentId', 'gatewayOrderId', 'customerPhone', 'bookingId', 'gatewaySettlementId', 'gatewaySettlementUtr'].map(
        (field) => ({ [field]: pattern })
      ),
    });
  }
  const base = { $and: and };

  try {
    const { db } = await connectToDatabase();
    await ensureIndexes(db);
    await syncPaymentStates(db);
    const transactions = db.collection('transactions');
    const filter = { $and: [...and, paymentStateFilter(status)] };

    const pending = await pendingPayments(db, { service, q, createdAt: dates.condition || null });
    const present = (item: Record<string, any>) => ({ ...item, state: displayStatus(item) });

    if (wantsCsv) {
      const items =
        status === 'pending'
          ? pending.slice(0, EXPORT_LIMIT)
          : await transactions.find(filter).sort({ createdAt: -1 }).limit(EXPORT_LIMIT).toArray();
      const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const refunded = items.reduce((sum, item) => sum + (Number(item.refundedAmount) || 0), 0);
      const kept = items.reduce((sum, item) => sum + (Number(item.refundDeductions) || 0), 0);
      const csv = buildExportCsv({
        name: `Payments (${status})`,
        rangeLabel: dates.label,
        generatedBy: check.admin.email,
        filters: [
          { label: 'Status', value: status },
          { label: 'Service', value: service ? serviceLabel(service) : 'All services' },
          { label: 'Search', value: q || 'None' },
        ],
        summary: [
          { label: 'Payments', value: items.length, type: 'number' },
          { label: 'Amount', value: roundMoney(total), type: 'money' },
          { label: 'Refunded to customers', value: roundMoney(refunded), type: 'money' },
        ],
        columns: EXPORT_COLUMNS,
        rows: items.map((item) => ({
          ...item,
          state: displayStatus(item),
          service: serviceLabel(item.service),
          commissionRate: item.ruleSnapshot?.ratePercent ?? '',
          note:
            item.note ||
            (item.status === 'failed'
              ? item.meta?.errorDescription || ''
              : item.dispute?.outcome === 'lost'
              ? 'Chargeback: dispute lost'
              : item.status === 'disputed'
              ? item.dispute?.reason || ''
              : ''),
        })),
        totals: items.length
          ? { createdAt: '', reference: 'Total', amount: roundMoney(total), refundedAmount: roundMoney(refunded), refundDeductions: roundMoney(kept) }
          : null,
        notes: [
          "Successful: money received. A partly refunded payment stays here with the amount returned. Refunded: returned in full (refund plus any amount kept under the refund rule), including chargebacks. Disputed: set aside with its commission, GST and gateway fee until the dispute is closed. Failed: an attempt the gateway rejected; no money was received. Pending: a booking awaiting payment against a gateway order.",
          ...(items.length >= EXPORT_LIMIT ? [`Only the newest ${EXPORT_LIMIT} payments are included.`] : []),
        ],
      });
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'finance',
        entityType: 'payments',
        entityLabel: `Payments (${status})`,
        meta: { status, service: service || null, q: q || null, dateRange: dates.label, rows: items.length, amount: roundMoney(total) },
        request,
      });
      return csvDownload(csv, exportFilename(`payments-${status}`, dates.label));
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const [items, counts, ledgerEntries, unverified] = await Promise.all([
      status === 'pending'
        ? Promise.resolve(pending.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE))
        : transactions
            .find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * PAGE_SIZE)
            .limit(PAGE_SIZE)
            .toArray(),
      transactions
        .aggregate([
          { $match: base },
          {
            $group: {
              _id: { $cond: [{ $and: [{ $eq: ['$status', 'success'] }, { $eq: ['$refundState', 'full'] }] }, 'refunded', '$status'] },
              count: { $sum: 1 },
              total: { $sum: '$amount' },
              refunded: { $sum: { $ifNull: ['$refundedAmount', 0] } },
              partlyRefunded: { $sum: { $cond: [{ $eq: ['$refundState', 'partial'] }, 1, 0] } },
            },
          },
        ])
        .toArray(),
      transactions.estimatedDocumentCount(),
      unverifiedTicketTotals(db),
    ]);

    const byStatus = Object.fromEntries(
      STATUSES.map((value) => {
        if (value === 'pending') {
          return [value, { count: pending.length, total: roundMoney(pending.reduce((t, row) => t + (Number(row.amount) || 0), 0)), refunded: 0, partlyRefunded: 0 }];
        }
        const row = counts.find((c) => c._id === value);
        return [
          value,
          { count: row?.count || 0, total: roundMoney(row?.total || 0), refunded: roundMoney(row?.refunded || 0), partlyRefunded: row?.partlyRefunded || 0 },
        ];
      })
    );

    return ok({
      items: items.map(present),
      page,
      pageSize: PAGE_SIZE,
      total: byStatus[status].count,
      counts: byStatus,
      rangeLabel: dates.label,
      ledgerEntries,
      unverifiedBookings: unverified,
    });
  } catch (error) {
    console.error('Payments list failed:', error);
    return fail('Could not load payments.', 500);
  }
}
