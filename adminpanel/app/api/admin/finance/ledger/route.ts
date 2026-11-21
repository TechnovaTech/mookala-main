import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, escapeRegex, fail, ok, toObjectId } from '@/lib/http';
import { SERVICES, recordTransaction, roundMoney, type Service } from '@/lib/ledger';
import {
  buildExportCsv,
  csvDownload,
  ensureIndexes,
  exportFilename,
  figuresFrom,
  groupLedger,
  optionalCreatedAt,
  serviceLabel,
  type ReportColumn,
} from '@/lib/reporting';
import { syncPaymentStates } from '../payments/shared';

export const dynamic = 'force-dynamic';

const TYPES = ['payment', 'commission', 'gst', 'gateway_fee', 'refund', 'refund_deduction', 'settlement', 'adjustment'];
const STATUSES = ['pending', 'success', 'failed', 'refunded', 'disputed'];
const PAYEE_TYPES = ['organizer', 'artist', 'instructor', 'cinema', 'advertiser', 'platform'];
const PAGE_SIZE = 50;
const EXPORT_LIMIT = 50_000;
const MAX_ADJUSTMENT = 10_000_000;

const EXPORT_COLUMNS: ReportColumn[] = [
  { key: 'createdAt', label: 'Date (IST)', type: 'datetime' },
  { key: 'reference', label: 'Reference', type: 'text' },
  { key: 'type', label: 'Type', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'service', label: 'Service', type: 'text' },
  { key: 'amount', label: 'Amount', type: 'money' },
  { key: 'direction', label: 'Adjustment direction', type: 'text' },
  { key: 'parentReference', label: 'Payment reference', type: 'text' },
  { key: 'payeeType', label: 'Payee type', type: 'text' },
  { key: 'payeeName', label: 'Payee', type: 'text' },
  { key: 'payeeId', label: 'Payee ID', type: 'text' },
  { key: 'customerPhone', label: 'Customer phone', type: 'text' },
  { key: 'bookingId', label: 'Booking ID', type: 'text' },
  { key: 'gatewayOrderId', label: 'Gateway order ID', type: 'text' },
  { key: 'gatewayPaymentId', label: 'Gateway payment ID', type: 'text' },
  { key: 'gatewaySettlementId', label: 'Gateway settlement ID', type: 'text' },
  { key: 'gatewaySettlementUtr', label: 'Gateway settlement UTR', type: 'text' },
  { key: 'linkedRecord', label: 'Refund / settlement record', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'createdBy', label: 'Created by', type: 'text' },
];

/** Every ledger entry, filtered, with totals for the whole filtered set. */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  const type = (params.get('type') || '').trim();
  const service = (params.get('service') || '').trim();
  const status = (params.get('status') || '').trim();
  const payeeType = (params.get('payeeType') || '').trim();
  const payee = (params.get('payee') || '').trim().slice(0, 100);
  const q = (params.get('q') || '').trim().slice(0, 100);

  if (type && !TYPES.includes(type)) return fail('Unknown entry type.');
  if (status && !STATUSES.includes(status)) return fail('Unknown status.');
  if (service && !SERVICES.some((s) => s.value === service)) return fail('Unknown service.');
  if (payeeType && !PAYEE_TYPES.includes(payeeType)) return fail('Unknown payee type.');
  const dates = optionalCreatedAt(params);
  if (typeof dates === 'string') return fail(dates);

  const filter: Record<string, any> = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (service) filter.service = service;
  if (payeeType) filter.payeeType = payeeType;
  if (dates.condition) filter.createdAt = dates.condition;
  const and: Record<string, any>[] = [];
  if (payee) and.push({ $or: [{ payeeId: payee }, { payeeName: new RegExp(escapeRegex(payee), 'i') }] });
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    and.push({
      $or: ['reference', 'parentReference', 'gatewayPaymentId', 'gatewayOrderId', 'bookingId', 'customerPhone', 'description'].map(
        (field) => ({ [field]: pattern })
      ),
    });
  }
  if (and.length) filter.$and = and;

  try {
    const { db } = await connectToDatabase();
    await ensureIndexes(db);
    // Refund state shown beside payment entries (refunded in part / in full).
    await syncPaymentStates(db);
    const transactions = db.collection('transactions');

    if (params.get('format') === 'csv') {
      const [items, groups] = await Promise.all([
        transactions.find(filter).sort({ createdAt: -1, _id: -1 }).limit(EXPORT_LIMIT).toArray(),
        groupLedger(db, filter),
      ]);
      const figures = figuresFrom(groups);
      const csv = buildExportCsv({
        name: 'Ledger entries',
        rangeLabel: dates.label,
        generatedBy: check.admin.email,
        filters: [
          { label: 'Type', value: type || 'All types' },
          { label: 'Status', value: status || 'All statuses' },
          { label: 'Service', value: service ? serviceLabel(service) : 'All services' },
          { label: 'Payee type', value: payeeType || 'All' },
          { label: 'Payee', value: payee || 'All' },
          { label: 'Search', value: q || 'None' },
        ],
        summary: [
          { label: 'Entries', value: groups.reduce((t, g) => t + g.count, 0), type: 'number' },
          { label: 'GTV', value: figures.gtv, type: 'money' },
          { label: 'Commission', value: figures.commission, type: 'money' },
          { label: 'Refund deductions', value: figures.refundDeductions, type: 'money' },
          { label: 'Platform revenue', value: figures.platformRevenue, type: 'money' },
          { label: 'GST collected', value: figures.gst, type: 'money' },
          { label: 'Gateway fees', value: figures.gatewayFees, type: 'money' },
          { label: 'Refunds', value: figures.refunds, type: 'money' },
          { label: 'Settlements paid', value: figures.settlementsPaid, type: 'money' },
        ],
        columns: EXPORT_COLUMNS,
        rows: items.map((item) => ({
          ...item,
          service: serviceLabel(item.service),
          direction: item.meta?.direction || '',
          linkedRecord: item.meta?.settlementId || item.meta?.refundId || '',
        })),
        notes: [
          'Amounts are always positive. The entry type says which way the money moved.',
          "Only entries with status 'success' are counted in the summary. A disputed payment and the entries derived from it carry status 'disputed' until the dispute is closed; charges reversed by a lost dispute carry 'refunded'; a failed payment attempt or a refund the gateway could not complete carries 'failed'.",
          ...(items.length >= EXPORT_LIMIT ? [`Only the newest ${EXPORT_LIMIT} entries are listed. The summary covers every entry.`] : []),
        ],
      });
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'finance',
        entityType: 'ledger',
        entityLabel: 'Ledger entries',
        meta: { type, status, service, payeeType, payee, q, dateRange: dates.label, rows: items.length },
        request,
      });
      return csvDownload(csv, exportFilename('ledger', dates.label));
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const [items, groups, ledgerEntries] = await Promise.all([
      transactions
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .toArray(),
      groupLedger(db, filter),
      transactions.estimatedDocumentCount(),
    ]);

    const byType = TYPES.map((value) => {
      const own = groups.filter((g) => g.type === value);
      const success = own.filter((g) => g.status === 'success');
      return {
        type: value,
        count: own.reduce((t, g) => t + g.count, 0),
        successCount: success.reduce((t, g) => t + g.count, 0),
        successTotal: roundMoney(success.reduce((t, g) => t + g.total, 0)),
        otherTotal: roundMoney(own.filter((g) => g.status !== 'success').reduce((t, g) => t + g.total, 0)),
      };
    });

    return ok({
      items,
      page,
      pageSize: PAGE_SIZE,
      total: groups.reduce((t, g) => t + g.count, 0),
      totals: { byType, figures: figuresFrom(groups) },
      rangeLabel: dates.label,
      ledgerEntries,
    });
  } catch (error) {
    console.error('Ledger list failed:', error);
    return fail('Could not load the ledger.', 500);
  }
}

/**
 * Adds a manual `adjustment` entry. The ledger is append-only, so this is the
 * only way to correct it; existing entries are never edited or deleted.
 *
 *   { amount, direction: 'credit' | 'debit', service, payeeType, payeeId?, payeeName?, reason }
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:manage');
  if (!check.ok) return check.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail('Invalid request body.');

  const amount = typeof body.amount === 'number' ? body.amount : Number(asString(body.amount, 20));
  const direction = asString(body.direction, 10);
  const service = asString(body.service, 40);
  const payeeType = asString(body.payeeType, 20);
  const payeeId = asString(body.payeeId, 60);
  let payeeName = asString(body.payeeName, 120);
  const reason = asString(body.reason, 500);

  if (!Number.isFinite(amount) || amount <= 0) return fail('Enter an amount greater than zero.');
  if (amount > MAX_ADJUSTMENT) return fail('The amount is too large for a single adjustment.');
  if (roundMoney(amount) !== amount) return fail('Use at most two decimal places.');
  if (direction !== 'credit' && direction !== 'debit') return fail('Choose whether the adjustment is a credit or a debit.');
  if (!SERVICES.some((s) => s.value === service)) return fail('Choose a service.');
  if (!PAYEE_TYPES.includes(payeeType)) return fail("Choose a payee type, or 'platform'.");
  if (payeeType !== 'platform' && !payeeId) return fail('Enter the ID of the payee the adjustment applies to.');
  if (reason.length < 10) return fail('A reason of at least 10 characters is required.');

  try {
    const { db } = await connectToDatabase();

    // Organisers and artists are checked against their collections so that a
    // mistyped ID cannot create an entry for a payee that does not exist.
    if (payeeType === 'organizer' || payeeType === 'artist') {
      const oid = toObjectId(payeeId);
      if (!oid) return fail('The payee ID is not a valid ID.');
      const record = await db
        .collection(payeeType === 'organizer' ? 'organizers' : 'artists')
        .findOne({ _id: oid }, { projection: { name: 1 } });
      if (!record) return fail(`No ${payeeType === 'organizer' ? 'organiser' : 'artist'} exists with that ID.`, 404);
      payeeName = record.name || payeeName;
    }

    const entry = await recordTransaction(db, {
      type: 'adjustment',
      service: service as Service,
      amount,
      status: 'success',
      payeeType: payeeType as any,
      payeeId: payeeType === 'platform' ? null : payeeId,
      payeeName: payeeType === 'platform' ? 'Platform' : payeeName || null,
      description: reason,
      createdBy: check.admin.email || null,
      meta: { direction },
    });

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'finance',
      entityType: 'ledger_adjustment',
      entityId: String(entry._id),
      entityLabel: entry.reference,
      after: { amount: entry.amount, direction, service, payeeType, payeeId: entry.payeeId, payeeName: entry.payeeName },
      reason,
      request,
    });

    return ok({ entry }, { status: 201 });
  } catch (error) {
    console.error('Ledger adjustment failed:', error);
    return fail('Could not record the adjustment.', 500);
  }
}
