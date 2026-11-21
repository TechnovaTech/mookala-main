import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, idFilter, ok } from '@/lib/http';
import { effectivePaymentStatus } from '@/lib/bookings';
import { clearDispute, displayStatus, loseDispute, openDispute, recomputeRefundState } from '../shared';

export const dynamic = 'force-dynamic';

const REFERENCE = /^[A-Za-z0-9_-]{4,60}$/;

async function loadPayment(db: Db, reference: string) {
  return db.collection('transactions').findOne({ type: 'payment', reference });
}

interface LogLine {
  at: Date | string | null;
  source: 'payment_log' | 'webhook' | 'ledger' | 'admin';
  title: string;
  detail: string;
  actor: string | null;
  outcome: string;
}

const KIND_TITLE: Record<string, string> = {
  order_created: 'Gateway order created',
  order_failed: 'Gateway order could not be created',
  verify_attempt: 'Checkout verification attempt',
  webhook: 'Webhook applied',
  payment_failed: 'Payment attempt failed',
  refund: 'Refund result from the gateway',
  dispute: 'Dispute',
  admin_action: 'Admin action',
};

const LEDGER_TITLE: Record<string, string> = {
  payment: 'Ledger: payment entry',
  commission: 'Ledger: commission',
  gst: 'Ledger: GST',
  gateway_fee: 'Ledger: gateway fee',
  refund: 'Ledger: refund',
  refund_deduction: 'Ledger: refund deduction',
};

/**
 * One payment with every reference that identifies it (ledger, gateway order,
 * gateway payment, booking, refunds, gateway settlement and UTR, commission
 * rule) and its full log: order creation, verification attempts, webhook
 * deliveries, ledger entries, refunds and admin actions, oldest first.
 */
export async function GET(request: NextRequest, { params }: { params: { reference: string } }) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;
  if (!REFERENCE.test(params.reference)) return fail('Invalid payment reference.');

  try {
    const { db } = await connectToDatabase();
    let payment = await loadPayment(db, params.reference);
    if (!payment) return fail('Payment not found.', 404);
    await recomputeRefundState(db, [payment.reference]);
    payment = (await loadPayment(db, params.reference)) || payment;

    const bookingId = payment.bookingId ? String(payment.bookingId) : '';
    const orderId = payment.gatewayOrderId ? String(payment.gatewayOrderId) : '';
    const paymentId = payment.gatewayPaymentId ? String(payment.gatewayPaymentId) : '';

    const refundKeys: Record<string, any>[] = [{ paymentReference: payment.reference }];
    if (paymentId) refundKeys.push({ gatewayPaymentId: paymentId });
    if (bookingId) refundKeys.push({ bookingId });

    const eventKeys: Record<string, any>[] = [{ reference: payment.reference }];
    if (bookingId) eventKeys.push({ bookingId });
    if (orderId) eventKeys.push({ gatewayOrderId: orderId });
    if (paymentId) eventKeys.push({ gatewayPaymentId: paymentId });

    const hookKeys: Record<string, any>[] = [];
    if (paymentId) hookKeys.push({ 'payload.payment.id': paymentId }, { 'payload.refund.payment_id': paymentId }, { 'payload.dispute.payment_id': paymentId });
    if (orderId) hookKeys.push({ 'payload.payment.order_id': orderId }, { 'payload.order.id': orderId });

    const [derived, booking, refunds, events, hooks, settlement] = await Promise.all([
      db.collection('transactions').find({ parentReference: payment.reference }).sort({ createdAt: 1, _id: 1 }).toArray(),
      bookingId ? db.collection('bookings').findOne(idFilter(bookingId)) : null,
      db.collection('refunds').find({ $or: refundKeys }).sort({ createdAt: 1 }).limit(50).toArray(),
      db.collection('paymentEvents').find({ $or: eventKeys }).sort({ at: 1 }).limit(300).toArray(),
      hookKeys.length
        ? db.collection('webhookEvents').find({ $or: hookKeys }).project({ payload: 0 }).sort({ receivedAt: 1 }).limit(100).toArray()
        : [],
      payment.gatewaySettlementId ? db.collection('gatewaySettlements').findOne({ settlementId: payment.gatewaySettlementId }) : null,
    ]);

    const refundIds = refunds.map((refund) => String(refund._id));
    const auditKeys: Record<string, any>[] = [{ entityType: 'payment', entityId: String(payment._id) }];
    if (bookingId) auditKeys.push({ entityType: 'booking', entityId: bookingId });
    if (refundIds.length) auditKeys.push({ entityType: 'refund', entityId: { $in: refundIds } });
    const audits = await db
      .collection('auditLogs')
      .find({ $or: auditKeys })
      .project({ adminEmail: 1, adminName: 1, action: 1, entityType: 1, reason: 1, before: 1, after: 1, createdAt: 1 })
      .sort({ createdAt: 1 })
      .limit(200)
      .toArray();

    const log: LogLine[] = [];
    for (const event of events) {
      log.push({
        at: event.at,
        source: 'payment_log',
        title: KIND_TITLE[event.kind] || event.kind,
        detail: event.message || '',
        actor: event.actor || null,
        outcome: event.outcome || '',
      });
    }
    for (const hook of hooks) {
      log.push({
        at: hook.receivedAt,
        source: 'webhook',
        title: 'Webhook received: ' + (hook.event || 'unknown event'),
        detail:
          (hook.signatureValid ? '' : 'Signature refused. ') +
          (hook.error ? 'Error: ' + hook.error : hook.result || (hook.processed ? 'Processed' : 'Not processed')) +
          (hook.deliveries > 1 ? ` (delivered ${hook.deliveries} times)` : ''),
        actor: 'razorpay',
        outcome: !hook.signatureValid ? 'refused' : hook.processed ? 'ok' : 'failed',
      });
    }
    for (const entry of [payment, ...derived]) {
      log.push({
        at: entry.createdAt,
        source: 'ledger',
        title: LEDGER_TITLE[entry.type] || 'Ledger: ' + entry.type,
        detail: `${entry.reference}, ₹${entry.amount}, now ${entry.status}` + (entry.description ? `. ${entry.description}` : ''),
        actor: entry.createdBy || null,
        outcome: entry.status === 'success' ? 'ok' : entry.status,
      });
    }
    for (const audit of audits) {
      const change = audit.after?.status ? ` (${audit.before?.status ?? 'none'} → ${audit.after.status})` : '';
      log.push({
        at: audit.createdAt,
        source: 'admin',
        title: `Admin: ${String(audit.action || '').replace(/_/g, ' ')} on the ${audit.entityType}` + change,
        detail: audit.reason || '',
        actor: audit.adminEmail || audit.adminName || null,
        outcome: 'ok',
      });
    }
    log.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());

    return ok({
      payment: { ...payment, _id: String(payment._id), state: displayStatus(payment) },
      derived: derived.map((entry) => ({ ...entry, _id: String(entry._id) })),
      booking: booking
        ? {
            _id: String(booking._id),
            eventTitle: booking.eventTitle || '',
            status: booking.status || null,
            paymentStatus: effectivePaymentStatus(booking),
            totalPrice: booking.totalPrice ?? null,
            amountPaid: booking.amountPaid ?? null,
            confirmedVia: booking.confirmedVia || null,
            refundId: booking.refundId || null,
          }
        : null,
      refunds: refunds.map((refund) => ({
        _id: String(refund._id),
        status: refund.status,
        refundAmount: refund.refundAmount,
        deductionAmount: refund.deductionAmount,
        reason: refund.reason || '',
        requestedBy: refund.requestedBy || null,
        firstApprover: refund.firstApprover || null,
        secondApprover: refund.secondApprover || null,
        gatewayRefundId: refund.gatewayRefundId || null,
        manualReference: refund.manualReference || null,
        source: refund.source || null,
        createdAt: refund.createdAt || null,
        processedAt: refund.processedAt || null,
      })),
      gatewaySettlement: payment.gatewaySettlementId
        ? {
            settlementId: payment.gatewaySettlementId,
            utr: payment.gatewaySettlementUtr || settlement?.utr || null,
            settledAt: payment.gatewaySettledAt || settlement?.settledAt || null,
            amount: settlement?.amount ?? null,
            status: settlement?.status || null,
            fee: payment.gatewayFeeCharged ?? null,
            tax: payment.gatewayTaxCharged ?? null,
          }
        : null,
      log,
    });
  } catch (error) {
    console.error('Payment detail failed:', error);
    return fail('Could not load the payment.', 500);
  }
}

const ACTIONS = ['dispute', 'clear_dispute', 'dispute_lost'] as const;
type Action = (typeof ACTIONS)[number];

/**
 * Dispute handling for one payment ('finance:manage'). The rule is in
 * ../shared.ts: a disputed payment and everything derived from it is set aside
 * until the dispute is cleared (it all counts again) or lost (it becomes a
 * full refund).
 *
 *   { action: 'dispute' | 'clear_dispute' | 'dispute_lost', reason }
 */
export async function POST(request: NextRequest, { params }: { params: { reference: string } }) {
  const check = await requireAdmin(request, 'finance:manage');
  if (!check.ok) return check.response;
  if (!REFERENCE.test(params.reference)) return fail('Invalid payment reference.');

  const body = await request.json().catch(() => null);
  const action = asString(body?.action, 30) as Action;
  const reason = asString(body?.reason, 500);
  if (!ACTIONS.includes(action)) return fail('Unknown action.');
  if (reason.length < 5) return fail('A reason of at least 5 characters is required.');

  try {
    const { db } = await connectToDatabase();
    const payment = await loadPayment(db, params.reference);
    if (!payment) return fail('Payment not found.', 404);

    const input = { by: check.admin.email || 'admin', reason, source: 'admin' as const };
    const result =
      action === 'dispute'
        ? await openDispute(db, payment, input)
        : action === 'clear_dispute'
        ? await clearDispute(db, payment, input)
        : await loseDispute(db, payment, input);
    if (!result.ok) return fail(result.error, result.status);

    await logAudit({
      admin: check.admin,
      action: action === 'dispute' ? 'mark_disputed' : action,
      module: 'finance',
      entityType: 'payment',
      entityId: String(payment._id),
      entityLabel: payment.reference,
      before: { status: payment.status },
      after: { status: result.status },
      reason,
      meta: {
        amount: payment.amount,
        gatewayPaymentId: payment.gatewayPaymentId || null,
        derivedEntriesChanged: result.entriesChanged,
        refundReference: result.refundReference || null,
        refundAmount: result.refundAmount ?? null,
      },
      request,
    });
    return ok({ status: result.status, entriesChanged: result.entriesChanged, refundReference: result.refundReference || null });
  } catch (error) {
    console.error('Payment dispute change failed:', error);
    return fail('Could not update the payment.', 500);
  }
}
