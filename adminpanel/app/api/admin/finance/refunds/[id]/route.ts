import { NextRequest } from 'next/server';
import type { Db, ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, fail, idFilter, ok, toObjectId } from '@/lib/http';
import { roundMoney } from '@/lib/ledger';
import { createRazorpayRefund, fetchRazorpayPayment, toPaise } from '@/lib/razorpay-api';
import { getFinanceSettings, refundApprovalLimit } from '../../settings/store';
import { findPaymentEntry, loadBooking, refundOutcome, serialiseDoc, writeBookingOutcome, writeRefundLedger } from '../shared';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  requested: 'requested',
  awaiting_second_approval: 'awaiting second approval',
  approved: 'approved',
  rejected: 'rejected',
  processing: 'processing',
  processed: 'processed',
  failed: 'failed',
  disputed: 'disputed',
};

function wrongStatus(action: string, status: string) {
  return fail(`A refund that is ${LABEL[status] || status} cannot be ${action}.`, 409);
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'refunds:view');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid refund ID', 400);

  try {
    const { db } = await connectToDatabase();
    const refund = await db.collection('refunds').findOne({ _id: oid });
    if (!refund) return fail('Refund not found', 404);

    const [booking, payment, ledger, history, settings] = await Promise.all([
      loadBooking(db, refund.bookingId),
      findPaymentEntry(db, refund),
      db.collection('transactions').find({ 'meta.refundId': params.id }).sort({ createdAt: 1 }).toArray(),
      db.collection('auditLogs').find({ entityType: 'refund', entityId: params.id }).sort({ createdAt: -1 }).limit(100).toArray(),
      getFinanceSettings(db),
    ]);

    const limit = refundApprovalLimit(settings, refund.service);
    const threshold = limit.amount;

    // The charges taken on the original payment, each its own ledger entry.
    const charges = payment
      ? await db
          .collection('transactions')
          .find({ parentReference: payment.reference, type: { $in: ['commission', 'gst', 'gateway_fee'] } })
          .sort({ createdAt: 1 })
          .toArray()
      : [];
    const stale = refund.status === 'processing' && refund.processingStartedAt
      ? Date.now() - new Date(refund.processingStartedAt).getTime() > STALE_MS
      : false;

    return ok({
      refund: serialiseDoc(refund),
      outcome: refundOutcome(refund),
      approvalLimitSource: limit.source,
      processingIsStale: stale,
      booking: booking
        ? {
            _id: String(booking._id),
            userPhone: booking.userPhone || null,
            eventTitle: booking.eventTitle || null,
            eventDate: booking.eventDate || null,
            eventTime: booking.eventTime || null,
            venue: typeof booking.venue === 'string' ? booking.venue : null,
            tickets: Array.isArray(booking.tickets) ? booking.tickets.slice(0, 50) : [],
            totalSeats: booking.totalSeats ?? null,
            totalPrice: booking.totalPrice ?? null,
            amountPaid: booking.amountPaid ?? null,
            status: booking.status || null,
            paymentStatus: booking.paymentStatus || null,
            gatewayOrderId: booking.gatewayOrderId || null,
            gatewayPaymentId: booking.gatewayPaymentId || null,
            cancelledAt: booking.cancelledAt || null,
            cancelReason: booking.cancelReason || null,
            cancelledBy: booking.cancelledBy || null,
            createdAt: booking.createdAt || null,
            // The rule applied when the booking was cancelled, as stored on the booking itself.
            refundQuote: booking.refundQuote || null,
            refundOutcome: booking.refundOutcome || null,
            ledgerReference: booking.ledgerReference || null,
          }
        : null,
      payment: payment
        ? {
            reference: payment.reference,
            amount: payment.amount,
            payeeType: payment.payeeType || null,
            payeeId: payment.payeeId || null,
            payeeName: payment.payeeName || null,
            createdAt: payment.createdAt,
            // The commission rule charged on this payment, copied when it was taken.
            ruleId: payment.ruleId || null,
            ruleSnapshot: payment.ruleSnapshot || null,
            charges: charges.map((c) => ({ reference: c.reference, type: c.type, amount: c.amount, status: c.status })),
          }
        : null,
      ledger: ledger.map(serialiseDoc),
      history: history.map(serialiseDoc),
      secondApprovalAbove: threshold,
      needsSecondApproval: threshold !== null && Number(refund.refundAmount) > threshold,
      canManage: can(check.admin, 'refunds:manage'),
      canApprove: can(check.admin, 'refunds:approve'),
      isFirstApprover: Boolean(refund.firstApprover && refund.firstApprover === check.admin.email),
    });
  } catch (error) {
    console.error('Load refund failed:', error);
    return fail('Failed to load the refund', 500);
  }
}

/** Moves a refund from one of `from` to the new state. False when another admin got there first. */
async function move(db: Db, id: ObjectId, from: string[], set: Record<string, any>, extraFilter: Record<string, any> = {}) {
  const result = await db
    .collection('refunds')
    .updateOne({ _id: id, status: { $in: from }, ...extraFilter }, { $set: { ...set, updatedAt: new Date() } });
  return result.modifiedCount === 1;
}

const RACE = 'This refund was changed by someone else a moment ago. Reload it and try again.';

/** A refund still "processing" with nothing back from the gateway after this long was interrupted. */
const STALE_MS = 120_000;

/**
 * POST { action, reason?, reference? }
 *   approve | reject | dispute | process | mark_manual | check_status | mark_failed
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'refunds:manage');
  if (!check.ok) return check.response;
  const admin = check.admin;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid refund ID', 400);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const action = asString(body.action, 30);
    const reason = asString(body.reason);
    const { db } = await connectToDatabase();
    const refunds = db.collection('refunds');
    const refund = await refunds.findOne({ _id: oid });
    if (!refund) return fail('Refund not found', 404);

    const status = String(refund.status);
    const amount = roundMoney(Number(refund.refundAmount) || 0);
    const label = `Booking ${refund.bookingId}`;
    const now = new Date();
    const email = admin.email || null;

    const audit = (name: string, after: Record<string, any>, why: string | null, meta?: Record<string, any>) =>
      logAudit({
        admin,
        action: name,
        module: 'refunds',
        entityType: 'refund',
        entityId: params.id,
        entityLabel: label,
        before: { status },
        after,
        reason: why,
        meta,
        request,
      });

    const done = async (extra: Record<string, any> = {}) => {
      const updated = await refunds.findOne({ _id: oid });
      return ok({ refund: serialiseDoc(updated!), status: updated!.status, ...extra });
    };

    /* ---------------------------- approve ---------------------------- */
    if (action === 'approve') {
      if (!can(admin, 'refunds:approve')) return fail('Approving a refund needs the refund approver permission.', 403);
      if (!email) return fail('Your admin account has no email, so the approval cannot be recorded.', 403);
      if (amount <= 0) return fail('This refund has no amount to return. Reject it instead.', 409);

      if (status === 'requested' || status === 'disputed') {
        const settings = await getFinanceSettings(db);
        const limit = refundApprovalLimit(settings, refund.service);
        const threshold = limit.amount;
        const needsSecond = threshold !== null && amount > threshold;
        const next = needsSecond ? 'awaiting_second_approval' : 'approved';
        const moved = await move(db, oid, [status], {
          status: next,
          firstApprover: email,
          firstApprovedAt: now,
          secondApprover: null,
          secondApprovedAt: null,
          approvalThreshold: threshold,
          approvalThresholdSource: limit.source,
        });
        if (!moved) return fail(RACE, 409);
        await audit('approve', { status: next, firstApprover: email }, reason || null, {
          refundAmount: amount,
          threshold,
          thresholdSource: limit.source,
        });
        await writeBookingOutcome(db, { ...refund, status: next }, { by: email });
        return done({ needsSecondApproval: needsSecond });
      }

      if (status === 'awaiting_second_approval') {
        if (refund.firstApprover === email) {
          return fail('You gave the first approval. A different admin must give the second approval.', 403);
        }
        const moved = await move(
          db,
          oid,
          ['awaiting_second_approval'],
          { status: 'approved', secondApprover: email, secondApprovedAt: now },
          { firstApprover: { $ne: email } }
        );
        if (!moved) return fail(RACE, 409);
        await audit('second_approve', { status: 'approved', secondApprover: email }, reason || null, { refundAmount: amount });
        await writeBookingOutcome(db, { ...refund, status: 'approved' }, { by: email });
        return done();
      }

      return wrongStatus('approved', status);
    }

    /* ---------------------------- reject ----------------------------- */
    if (action === 'reject') {
      if (reason.length < 5) return fail('A written reason is required to reject a refund');
      const from = ['requested', 'awaiting_second_approval', 'approved', 'disputed', 'failed'];
      if (!from.includes(status)) return wrongStatus('rejected', status);
      const moved = await move(db, oid, from, { status: 'rejected', rejectedBy: email, rejectedAt: now, rejectionReason: reason });
      if (!moved) return fail(RACE, 409);

      // No money goes back, so the booking returns to the payment state it had
      // before the refund was opened: a customer's cancelled booking stays
      // cancelled and paid, with the rejection recorded on it.
      const booking = await loadBooking(db, refund.bookingId);
      const restore =
        booking && booking.paymentStatus === 'refund_requested' && String(booking.refundId || '') === params.id
          ? String(refund.bookingPaymentStatusBefore || 'paid')
          : undefined;
      await writeBookingOutcome(db, { ...refund, status: 'rejected', rejectionReason: reason }, { paymentStatus: restore, by: email });
      await audit('reject', { status: 'rejected', bookingPaymentStatus: restore || booking?.paymentStatus || null }, reason);
      return done();
    }

    /* ---------------------------- dispute ---------------------------- */
    if (action === 'dispute') {
      if (reason.length < 5) return fail('A written reason is required to mark a refund as disputed');
      const from = ['requested', 'awaiting_second_approval', 'approved', 'rejected', 'failed'];
      if (!from.includes(status)) return wrongStatus('marked as disputed', status);
      const moved = await move(db, oid, from, {
        status: 'disputed',
        disputedBy: email,
        disputedAt: now,
        disputeReason: reason,
        firstApprover: null,
        secondApprover: null,
      });
      if (!moved) return fail(RACE, 409);
      // A rejected refund that is disputed is open again, so the booking shows a refund in progress.
      await writeBookingOutcome(
        db,
        { ...refund, status: 'disputed', disputeReason: reason },
        { paymentStatus: status === 'rejected' ? 'refund_requested' : undefined, by: email }
      );
      await audit('dispute', { status: 'disputed' }, reason);
      return done();
    }

    /* --------------------- shared by both payouts -------------------- */
    // The gateway payment may be recorded on the refund or only on the booking.
    const paidBooking = refund.gatewayPaymentId ? null : await loadBooking(db, refund.bookingId);
    const gatewayPaymentId: string | null = refund.gatewayPaymentId || paidBooking?.gatewayPaymentId || null;
    if (gatewayPaymentId && !refund.gatewayPaymentId) refund.gatewayPaymentId = gatewayPaymentId;

    const recordLedger = async (ids: { gatewayRefundId?: string | null; manualReference?: string | null }) => {
      const outcome = await writeRefundLedger(db, refund, { adminEmail: email, ...ids });
      await refunds.updateOne(
        { _id: oid },
        {
          $set: {
            ledgerRecordedAt: refund.ledgerRecordedAt || now,
            ledgerReferences: outcome.entries.map((e: any) => e.reference),
            ledgerError: null,
            updatedAt: new Date(),
          },
        }
      );
      if (refund.bookingId) {
        await db
          .collection('bookings')
          .updateOne(idFilter(String(refund.bookingId)), { $set: { paymentStatus: 'refunded', refundId: params.id, updatedAt: new Date() } });
        const latest = await refunds.findOne({ _id: oid });
        if (latest) await writeBookingOutcome(db, latest, { by: email });
      }
      return outcome;
    };

    /* ---------------------------- process ---------------------------- */
    if (action === 'process') {
      if (amount <= 0) return fail('This refund has no amount to return.', 409);

      // While the customer's bank is handling a dispute on this payment, a refund
      // would return the money twice.
      const disputedPayment = await findPaymentEntry(db, refund);
      if (disputedPayment?.status === 'disputed') {
        return fail('The original payment is under dispute with the bank. Settle the dispute on Finance → Payments before refunding.', 409);
      }

      // The gateway accepted the refund earlier but the ledger write did not finish.
      if (status === 'processing' && refund.gatewayRefundId && !refund.ledgerRecordedAt) {
        // One admin at a time: the claim lapses after two minutes if the write never finished.
        const stale = new Date(now.getTime() - 120_000);
        const claim = await refunds.updateOne(
          {
            _id: oid,
            status: 'processing',
            ledgerRecordedAt: { $in: [null] },
            $or: [{ ledgerClaimedAt: { $in: [null] } }, { ledgerClaimedAt: { $lt: stale } }],
          },
          { $set: { ledgerClaimedAt: now } }
        );
        if (claim.modifiedCount !== 1) return fail(RACE, 409);
        const outcome = await recordLedger({ gatewayRefundId: refund.gatewayRefundId });
        await audit('record_ledger', { status: 'processing', ledgerEntries: outcome.entries.length }, reason || null);
        return done({ ledgerWritten: outcome.written });
      }

      if (!['approved', 'failed'].includes(status)) {
        return fail(`Only an approved refund can be processed. This one is ${LABEL[status] || status}.`, 409);
      }
      if (!refund.firstApprover) return fail('This refund has not been approved.', 409);
      if (!gatewayPaymentId) {
        return fail(
          'This booking was not paid through the gateway, so the gateway cannot refund it. Refund the customer directly and use "Mark as refunded manually".',
          409
        );
      }

      // Claim the refund so two admins cannot send it to the gateway twice.
      const claimed = await move(db, oid, ['approved', 'failed'], {
        status: 'processing',
        processingStartedAt: now,
        processedBy: email,
        failureMessage: null,
      });
      if (!claimed) return fail(RACE, 409);

      const gateway = await createRazorpayRefund(gatewayPaymentId, amount, {
        refundId: params.id,
        bookingId: String(refund.bookingId || ''),
      });

      if (!gateway.ok || !gateway.data?.id) {
        const message = gateway.error || 'The gateway did not accept the refund.';
        await refunds.updateOne(
          { _id: oid },
          { $set: { status: 'failed', failureMessage: message, failedAt: new Date(), updatedAt: new Date() } }
        );
        await writeBookingOutcome(db, { ...refund, status: 'failed' }, { by: email });
        await audit('process_failed', { status: 'failed', failureMessage: message }, reason || null, {
          gatewayStatus: gateway.status,
          notConfigured: Boolean(gateway.notConfigured),
        });
        return fail('The refund was not sent. ' + message, 502, { status: 'failed', notConfigured: Boolean(gateway.notConfigured) });
      }

      await refunds.updateOne(
        { _id: oid },
        { $set: { gatewayRefundId: gateway.data.id, gatewayRefundStatus: gateway.data.status || null, updatedAt: new Date() } }
      );

      try {
        const outcome = await recordLedger({ gatewayRefundId: gateway.data.id });
        await audit('process', { status: 'processing', gatewayRefundId: gateway.data.id }, reason || null, {
          refundAmount: amount,
          ledger: outcome.entries.map((e: any) => e.reference),
        });
      } catch (ledgerError: any) {
        console.error('Refund sent but ledger write failed:', ledgerError);
        await refunds.updateOne({ _id: oid }, { $set: { ledgerError: String(ledgerError?.message || ledgerError), updatedAt: new Date() } });
        await audit('process', { status: 'processing', gatewayRefundId: gateway.data.id, ledgerError: true }, reason || null);
        return fail(
          'The gateway accepted the refund, but the ledger entries could not be written. Press "Process" again to record them; the customer will not be refunded twice.',
          500
        );
      }
      return done();
    }

    /* -------------------------- mark_manual -------------------------- */
    if (action === 'mark_manual') {
      const reference = asString(body.reference, 120);
      if (reference.length < 3) return fail('The bank or UPI reference of the refund is required');
      if (amount <= 0) return fail('This refund has no amount to return.', 409);
      if (!['approved', 'failed'].includes(status)) {
        return fail(`Only an approved refund can be marked as refunded. This one is ${LABEL[status] || status}.`, 409);
      }
      if (!refund.firstApprover) return fail('This refund has not been approved.', 409);
      // Money paid through the gateway goes back through the gateway. Only when
      // the gateway has refused or cannot be used may it be returned directly.
      const afterGatewayFailure = Boolean(gatewayPaymentId) && status === 'failed';
      if (gatewayPaymentId && !afterGatewayFailure) {
        return fail('This booking was paid through the gateway. Use "Process" so the money goes back the way it came.', 409);
      }
      if (afterGatewayFailure && reason.length < 5) {
        return fail('This booking was paid through the gateway. Write why the refund was paid directly instead.');
      }

      const claimed = await move(db, oid, ['approved', 'failed'], {
        status: 'processed',
        manualReference: reference,
        processedAt: now,
        processedBy: email,
        paidOutsideGateway: afterGatewayFailure,
      });
      if (!claimed) return fail(RACE, 409);
      refund.status = 'processed';
      refund.manualReference = reference;

      try {
        const outcome = await recordLedger({ manualReference: reference });
        await audit('manual_refund', { status: 'processed', manualReference: reference }, reason || null, {
          refundAmount: amount,
          ledger: outcome.entries.map((e: any) => e.reference),
        });
      } catch (ledgerError) {
        console.error('Manual refund ledger write failed:', ledgerError);
        await refunds.updateOne(
          { _id: oid },
          { $set: { status, manualReference: null, processedAt: null, updatedAt: new Date() } }
        );
        return fail('The ledger entries could not be written, so the refund was not marked as refunded. Try again.', 500);
      }
      return done();
    }

    /* ------------------- recovery of a stuck refund ------------------- */
    if (action === 'check_status') {
      if (status !== 'processing') return fail(`Only a refund that is processing can be checked. This one is ${LABEL[status] || status}.`, 409);
      if (!gatewayPaymentId) return fail('This refund has no gateway payment to check.', 409);

      const payment = await fetchRazorpayPayment(gatewayPaymentId);
      if (!payment.ok || !payment.data) {
        return fail(
          'The gateway could not be asked about this refund. ' +
            (payment.error || 'No answer was returned.') +
            (refund.gatewayRefundId ? '' : ' If you know the refund was not sent, use "Mark as failed".'),
          502,
          { notConfigured: Boolean(payment.notConfigured) }
        );
      }

      const refundedPaise = Number(payment.data.amount_refunded) || 0;
      if (refundedPaise >= toPaise(amount)) {
        // The gateway has returned the money: finish what was interrupted.
        const moved = await move(db, oid, ['processing'], { status: 'processed', processedAt: now, gatewayStatus: 'confirmed_by_check', failureMessage: null });
        if (!moved) return fail(RACE, 409);
        refund.status = 'processed';
        const outcome = await recordLedger({ gatewayRefundId: refund.gatewayRefundId || null });
        await audit('check_status', { status: 'processed' }, reason || null, {
          gatewayRefundedPaise: refundedPaise,
          ledger: outcome.entries.map((e: any) => e.reference),
        });
        return done({ message: 'The gateway confirms the money was returned. The refund is processed.' });
      }

      if (refund.gatewayRefundId) {
        await audit('check_status', { status: 'processing' }, reason || null, { gatewayRefundedPaise: refundedPaise });
        return done({ message: 'The gateway has accepted the refund but has not returned the money yet. Check again later.' });
      }

      // Nothing was refunded and no gateway refund was ever recorded: it was never sent.
      const message = 'The gateway shows no refund for this payment, so it was not sent. It can be tried again.';
      const moved = await move(db, oid, ['processing'], { status: 'failed', failureMessage: message, failedAt: now }, { gatewayRefundId: { $in: [null] } });
      if (!moved) return fail(RACE, 409);
      await writeBookingOutcome(db, { ...refund, status: 'failed' }, { by: email });
      await audit('check_status', { status: 'failed', failureMessage: message }, reason || null, { gatewayRefundedPaise: refundedPaise });
      return done({ message });
    }

    if (action === 'mark_failed') {
      if (reason.length < 5) return fail('A written reason is required to mark a refund as failed');
      if (status !== 'processing') return fail(`Only a refund that is processing can be marked as failed. This one is ${LABEL[status] || status}.`, 409);
      if (refund.gatewayRefundId || refund.ledgerRecordedAt) {
        return fail(
          'The gateway accepted this refund, so it cannot be marked as failed here. Use "Check status with the gateway"; if the gateway rejects it later, it reports that itself.',
          409
        );
      }
      const started = refund.processingStartedAt ? new Date(refund.processingStartedAt).getTime() : 0;
      if (Date.now() - started < STALE_MS) {
        return fail('This refund was sent to the gateway less than two minutes ago and may still be answered. Try again shortly.', 409);
      }
      const message = 'Marked as failed by an admin: ' + reason;
      const moved = await move(
        db,
        oid,
        ['processing'],
        { status: 'failed', failureMessage: message, failedAt: now, markedFailedBy: email },
        { gatewayRefundId: { $in: [null] }, ledgerRecordedAt: { $in: [null] } }
      );
      if (!moved) return fail(RACE, 409);
      await writeBookingOutcome(db, { ...refund, status: 'failed' }, { by: email });
      await audit('mark_failed', { status: 'failed', failureMessage: message }, reason);
      return done({ message: 'Refund marked as failed. Nothing was written to the ledger.' });
    }

    return fail('Unknown action');
  } catch (error) {
    console.error('Refund action failed:', error);
    return fail('Failed to update the refund', 500);
  }
}
