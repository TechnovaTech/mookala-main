import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, csvResponse, escapeRegex, fail, ok, parseAmount, toCsv } from '@/lib/http';
import { roundMoney, SERVICES } from '@/lib/ledger';
import { findRefundRule, quoteRefund } from '@/lib/refund-rules';
import { getFinanceSettings, refundApprovalLimit } from '../settings/store';
import { REFUND_STATUSES, asService, eventStart, findPaymentEntry, loadBooking, loadEvent, serialiseDoc } from './shared';

export const dynamic = 'force-dynamic';

const EXPORT_LIMIT = 5000;

const EXPORT_COLUMNS = [
  { key: '_id', label: 'Refund ID' },
  { key: 'status', label: 'Status' },
  { key: 'bookingId', label: 'Booking ID' },
  { key: 'service', label: 'Service' },
  { key: 'customerPhone', label: 'Customer phone' },
  { key: 'eventTitle', label: 'Event' },
  { key: 'amountPaid', label: 'Amount paid' },
  { key: 'refundPercent', label: 'Refund %' },
  { key: 'deductionAmount', label: 'Deduction' },
  { key: 'refundAmount', label: 'Refund amount' },
  { key: 'ruleName', label: 'Rule applied' },
  { key: 'reason', label: 'Reason' },
  { key: 'requestedBy', label: 'Requested by' },
  { key: 'firstApprover', label: 'First approver' },
  { key: 'secondApprover', label: 'Second approver' },
  { key: 'paymentReference', label: 'Payment reference' },
  { key: 'gatewayPaymentId', label: 'Gateway payment ID' },
  { key: 'gatewayRefundId', label: 'Gateway refund ID' },
  { key: 'manualReference', label: 'Manual refund reference' },
  { key: 'failureMessage', label: 'Failure message' },
  { key: 'createdAt', label: 'Requested at' },
  { key: 'processedAt', label: 'Processed at' },
];

/** What a refund for this booking would be right now, under the active refund rules. */
async function quoteForBooking(db: Db, booking: any) {
  const payment = await findPaymentEntry(db, {
    bookingId: String(booking._id),
    gatewayPaymentId: booking.gatewayPaymentId || null,
  });
  const event = await loadEvent(db, booking.eventId);
  const service = asService(payment?.service);
  const amountPaid = roundMoney(
    typeof booking.amountPaid === 'number' && booking.amountPaid > 0 ? booking.amountPaid : parseAmount(booking.totalPrice)
  );

  const start = eventStart(event, booking);
  const hoursBefore = start ? roundMoney((start.getTime() - Date.now()) / 3_600_000) : null;
  const rule = hoursBefore !== null && hoursBefore >= 0 ? await findRefundRule(db, service, hoursBefore) : null;
  const quote = quoteRefund(amountPaid, rule);

  return { payment, event, service, amountPaid, hoursBefore, eventStartsAt: start, quote };
}

function bookingSummary(booking: any) {
  return {
    _id: String(booking._id),
    userPhone: booking.userPhone || null,
    eventId: booking.eventId ? String(booking.eventId) : null,
    eventTitle: booking.eventTitle || null,
    eventDate: booking.eventDate || null,
    eventTime: booking.eventTime || null,
    totalSeats: booking.totalSeats ?? null,
    totalPrice: booking.totalPrice ?? null,
    amountPaid: booking.amountPaid ?? null,
    status: booking.status || null,
    paymentStatus: booking.paymentStatus || null,
    gatewayPaymentId: booking.gatewayPaymentId || null,
    refundId: booking.refundId || null,
    createdAt: booking.createdAt || null,
  };
}

/** A refund can be raised only for a booking with a recorded payment and no refund in progress. */
async function raiseProblem(db: Db, booking: any): Promise<string | null> {
  const paymentStatus = String(booking.paymentStatus || '');
  if (paymentStatus === 'refunded') return 'This booking has already been refunded.';
  if (!['paid', 'unverified', 'refund_requested'].includes(paymentStatus)) {
    return 'This booking has no recorded payment, so there is nothing to refund.';
  }
  const open = await db
    .collection('refunds')
    .findOne({ bookingId: { $in: [String(booking._id), booking._id] }, status: { $ne: 'rejected' } });
  if (open) return 'This booking already has a refund (status: ' + String(open.status).replace(/_/g, ' ') + ').';
  return null;
}

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'refunds:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;

    // Preview for "Raise a refund": the booking and what the rules give.
    const preview = (params.get('preview') || '').trim().slice(0, 64);
    if (preview) {
      const booking = await loadBooking(db, preview);
      if (!booking) return fail('No booking has this ID', 404);
      const q = await quoteForBooking(db, booking);
      return ok({
        booking: bookingSummary(booking),
        service: q.service,
        amountPaid: q.amountPaid,
        hoursBefore: q.hoursBefore,
        eventStartsAt: q.eventStartsAt,
        quote: q.quote,
        paymentReference: q.payment?.reference || null,
        inLedger: Boolean(q.payment),
        problem: await raiseProblem(db, booking),
      });
    }

    const filter: Record<string, any> = {};
    const status = params.get('status') || '';
    if ((REFUND_STATUSES as readonly string[]).includes(status)) filter.status = status;

    const service = params.get('service') || '';
    if (SERVICES.some((s) => s.value === service)) filter.service = service;

    const requestedBy = params.get('requestedBy') || '';
    if (requestedBy === 'customer') filter.requestedBy = 'customer';
    if (requestedBy === 'admin') filter.requestedBy = { $ne: 'customer' };

    const from = params.get('from');
    const to = params.get('to');
    const range: Record<string, Date> = {};
    if (from && !Number.isNaN(new Date(from).getTime())) range.$gte = new Date(from);
    if (to && !Number.isNaN(new Date(to).getTime())) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    if (Object.keys(range).length) filter.createdAt = range;

    const q = (params.get('q') || '').trim().slice(0, 100);
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' };
      filter.$or = [
        { bookingId: regex },
        { customerPhone: regex },
        { eventTitle: regex },
        { gatewayPaymentId: regex },
        { gatewayRefundId: regex },
        { paymentReference: regex },
        { manualReference: regex },
      ];
    }

    const collection = db.collection('refunds');

    if (params.get('export') === 'csv') {
      const rows = await collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_LIMIT).toArray();
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'refunds',
        entityType: 'refund',
        meta: { rows: rows.length, filter: Object.keys(filter) },
        request,
      });
      const flat = rows.map((r) => ({ ...r, _id: String(r._id), ruleName: r.ruleSnapshot?.name || '' }));
      return csvResponse(toCsv(flat, EXPORT_COLUMNS), `refunds-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(params.get('limit') || '25', 10) || 25));

    const [items, total, grouped, settings] = await Promise.all([
      collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
      collection.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$refundAmount' } } }]).toArray(),
      getFinanceSettings(db),
    ]);

    return ok({
      items: items.map(serialiseDoc),
      total,
      page,
      limit,
      statusCounts: Object.fromEntries(grouped.map((g) => [String(g._id), g.count])),
      statusAmounts: Object.fromEntries(grouped.map((g) => [String(g._id), roundMoney(g.amount || 0)])),
      secondApprovalAbove: settings.refundSecondApprovalAbove,
      // Services with their own limit; every other service uses the global one above.
      serviceApprovalLimits: SERVICES.map((s) => ({ service: s.value, label: s.label, ...refundApprovalLimit(settings, s.value) })).filter(
        (limit) => limit.source === 'service'
      ),
      canManage: can(check.admin, 'refunds:manage'),
      canApprove: can(check.admin, 'refunds:approve'),
    });
  } catch (error) {
    console.error('List refunds failed:', error);
    return fail('Failed to load the refunds', 500);
  }
}

/** An admin raises a refund for a booking. It then goes through the same approval steps. */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'refunds:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const bookingId = asString(body.bookingId, 64);
    if (!bookingId) return fail('Booking ID is required');
    const reason = asString(body.reason);
    if (reason.length < 5) return fail('A written reason is required to raise a refund');

    const { db } = await connectToDatabase();
    const booking = await loadBooking(db, bookingId);
    if (!booking) return fail('No booking has this ID', 404);

    const problem = await raiseProblem(db, booking);
    if (problem) return fail(problem, 409);

    const q = await quoteForBooking(db, booking);
    if (q.amountPaid <= 0) return fail('This booking has no amount paid, so there is nothing to refund.', 409);

    let refundAmount = q.quote.refundAmount;
    let overridden = false;
    if (body.refundAmount !== undefined && body.refundAmount !== null && body.refundAmount !== '') {
      const asked = roundMoney(Number(body.refundAmount));
      if (!Number.isFinite(asked) || asked <= 0) return fail('The refund amount must be a number above 0');
      if (asked > q.amountPaid) return fail('The refund amount cannot be more than the amount paid');
      overridden = asked !== q.quote.refundAmount;
      refundAmount = asked;
    }
    if (refundAmount <= 0) {
      return fail(
        'The active refund rules give no refund for this booking at this time. Enter the amount to refund if one is still due.',
        409
      );
    }

    const eventOwner = q.event?.organizerId ? String(q.event.organizerId) : null;
    const now = new Date();
    const doc = {
      bookingId: String(booking._id),
      service: q.service,
      customerPhone: booking.userPhone || null,
      eventId: booking.eventId ? String(booking.eventId) : null,
      eventTitle: booking.eventTitle || q.event?.name || null,
      payeeType: q.payment?.payeeType || (eventOwner ? (q.event?.creatorRole === 'artist' ? 'artist' : 'organizer') : null),
      payeeId: q.payment?.payeeId || eventOwner,
      paymentReference: q.payment?.reference || null,
      gatewayPaymentId: booking.gatewayPaymentId || q.payment?.gatewayPaymentId || null,
      amountPaid: q.amountPaid,
      refundPercent: overridden ? roundMoney((refundAmount / q.amountPaid) * 100) : q.quote.refundPercent,
      deductionAmount: roundMoney(q.amountPaid - refundAmount),
      refundAmount,
      ruleId: q.quote.ruleId,
      ruleSnapshot: q.quote.ruleSnapshot,
      ruleRefundAmount: q.quote.refundAmount,
      amountOverridden: overridden,
      hoursBeforeEvent: q.hoursBefore,
      reason,
      requestedBy: check.admin.email || 'admin',
      status: 'requested',
      firstApprover: null,
      secondApprover: null,
      gatewayRefundId: null,
      processedAt: null,
      bookingPaymentStatusBefore: booking.paymentStatus || null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('refunds').insertOne(doc);
    await db
      .collection('bookings')
      .updateOne({ _id: booking._id }, { $set: { paymentStatus: 'refund_requested', refundId: String(result.insertedId), updatedAt: now } });

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'refunds',
      entityType: 'refund',
      entityId: String(result.insertedId),
      entityLabel: `Booking ${doc.bookingId}`,
      after: doc,
      reason,
      request,
    });

    return ok({ id: String(result.insertedId), item: serialiseDoc({ ...doc, _id: result.insertedId }) }, { status: 201 });
  } catch (error) {
    console.error('Raise refund failed:', error);
    return fail('Failed to raise the refund', 500);
  }
}
