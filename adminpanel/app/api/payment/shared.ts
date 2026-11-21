import { ObjectId, type Db } from 'mongodb';
import { idFilter } from '@/lib/http';
import { recordFailedPayment, roundMoney } from '@/lib/ledger';
import { BookingError, confirmPaidBooking, releaseBooking } from '@/lib/bookings';
import { clearDispute, loseDispute, openDispute, recomputeRefundState } from '@/app/api/admin/finance/payments/shared';
import { findPaymentEntry, writeBookingOutcome, writeRefundLedger } from '@/app/api/admin/finance/refunds/shared';

/* ------------------------------------------------------------------ */
/* Payment event log                                                   */
/* ------------------------------------------------------------------ */

export type PaymentEventKind =
  | 'order_created'
  | 'order_failed'
  | 'verify_attempt'
  | 'webhook'
  | 'payment_failed'
  | 'refund'
  | 'dispute'
  | 'admin_action';

export interface PaymentEvent {
  kind: PaymentEventKind;
  /** 'ok' when the step did what it was meant to; 'refused' / 'failed' otherwise. */
  outcome: 'ok' | 'pending' | 'refused' | 'failed';
  message: string;
  bookingId?: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  /** Ledger reference of the payment entry, when one exists. */
  reference?: string | null;
  /** Rupees. */
  amount?: number | null;
  /** 'customer', 'razorpay' or an admin's email. */
  actor?: string | null;
  meta?: Record<string, any>;
}

let eventIndexes: Promise<unknown> | null = null;
function ensureEventIndexes(db: Db) {
  if (!eventIndexes) {
    const events = db.collection('paymentEvents');
    eventIndexes = Promise.all([
      events.createIndex({ bookingId: 1, at: 1 }),
      events.createIndex({ gatewayOrderId: 1 }, { sparse: true }),
      events.createIndex({ gatewayPaymentId: 1 }, { sparse: true }),
    ]).catch((error) => {
      eventIndexes = null;
      console.error('Could not create the payment event indexes:', error?.message || error);
    });
  }
  return eventIndexes;
}

/**
 * Appends one line to the `paymentEvents` log: every order created, every
 * attempt to verify a checkout, every webhook result and every admin action on
 * a payment. It holds identifiers, amounts and outcomes only, never card, UPI
 * or contact details. A failure to log never blocks the payment itself.
 */
export async function logPaymentEvent(db: Db, event: PaymentEvent): Promise<void> {
  try {
    await ensureEventIndexes(db);
    await db.collection('paymentEvents').insertOne({
      kind: event.kind,
      outcome: event.outcome,
      message: String(event.message || '').slice(0, 500),
      bookingId: event.bookingId ? String(event.bookingId) : null,
      gatewayOrderId: event.gatewayOrderId || null,
      gatewayPaymentId: event.gatewayPaymentId || null,
      reference: event.reference || null,
      amount: typeof event.amount === 'number' ? roundMoney(event.amount) : null,
      actor: event.actor || null,
      meta: event.meta || null,
      at: new Date(),
    });
  } catch (error) {
    console.error('Could not write a payment event:', error);
  }
}

/* ------------------------------------------------------------------ */
/* Webhook payloads                                                    */
/* ------------------------------------------------------------------ */

const NOTE_KEYS = ['bookingId', 'eventId', 'refundId'];

function text(value: unknown, max = 120): string | null {
  return typeof value === 'string' && value ? value.slice(0, max) : null;
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Only the notes this server writes itself; anything else a client put there is dropped. */
function ownNotes(notes: unknown): Record<string, string> | null {
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return null;
  const out: Record<string, string> = {};
  for (const key of NOTE_KEYS) {
    const value = text((notes as any)[key], 60);
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

export interface StoredWebhookPayload {
  event: string | null;
  account_id: string | null;
  created_at: number | null;
  payment: Record<string, any> | null;
  refund: Record<string, any> | null;
  order: Record<string, any> | null;
  dispute: Record<string, any> | null;
}

/**
 * What is kept of a webhook delivery: the identifiers, amounts, statuses and
 * the payment method name that are needed to trace it and to process it again.
 * Card numbers, VPAs, bank details, email, phone and free-text notes are never
 * stored. The handler below works from this trimmed form, so a stored delivery
 * can be replayed exactly.
 */
export function trimWebhookPayload(body: any): StoredWebhookPayload {
  const payment = body?.payload?.payment?.entity;
  const refund = body?.payload?.refund?.entity;
  const order = body?.payload?.order?.entity;
  const dispute = body?.payload?.dispute?.entity;
  const isObject = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
  return {
    event: text(body?.event, 80),
    account_id: text(body?.account_id, 40),
    created_at: whole(body?.created_at),
    payment: isObject(payment)
      ? {
          id: text(payment.id),
          order_id: text(payment.order_id),
          amount: whole(payment.amount),
          currency: text(payment.currency, 8),
          status: text(payment.status, 30),
          method: text(payment.method, 30),
          fee: whole(payment.fee),
          tax: whole(payment.tax),
          amount_refunded: whole(payment.amount_refunded),
          error_code: text(payment.error_code, 80),
          error_description: text(payment.error_description, 300),
          notes: ownNotes(payment.notes),
        }
      : null,
    refund: isObject(refund)
      ? {
          id: text(refund.id),
          payment_id: text(refund.payment_id),
          amount: whole(refund.amount),
          currency: text(refund.currency, 8),
          status: text(refund.status, 30),
          notes: ownNotes(refund.notes),
        }
      : null,
    order: isObject(order)
      ? { id: text(order.id), amount: whole(order.amount), status: text(order.status, 30), receipt: text(order.receipt, 60) }
      : null,
    dispute: isObject(dispute)
      ? {
          id: text(dispute.id),
          payment_id: text(dispute.payment_id),
          amount: whole(dispute.amount),
          reason_code: text(dispute.reason_code, 80),
          status: text(dispute.status, 30),
          phase: text(dispute.phase, 30),
        }
      : null,
  };
}

/** Payloads stored before the trimmed form was the handler's input have the same shape; old rows only lack some keys. */
export const HANDLED_EVENTS = [
  'payment.captured',
  'payment.failed',
  'refund.processed',
  'refund.failed',
  'payment.dispute.created',
  'payment.dispute.won',
  'payment.dispute.lost',
];

async function bookingForOrder(db: Db, orderId: unknown) {
  if (typeof orderId !== 'string' || !orderId) return null;
  return db.collection('bookings').findOne({ gatewayOrderId: orderId });
}

async function payeeNameOf(db: Db, booking: any): Promise<string | null> {
  if (!booking?.payeeId || !/^[a-f0-9]{24}$/i.test(String(booking.payeeId))) return null;
  const collection = booking.payeeType === 'artist' ? 'artists' : 'organizers';
  const doc = await db.collection(collection).findOne({ _id: new ObjectId(String(booking.payeeId)) }, { projection: { name: 1 } });
  return typeof doc?.name === 'string' ? doc.name : null;
}

/**
 * Writes the failed attempt to the ledger (status 'failed', counted in no
 * figure) so it is listed under Payments -> Failed.
 */
export async function recordFailedAttempt(
  db: Db,
  booking: any,
  attempt: { id: string; orderId: string | null; amountPaise: number | null; method?: string | null; errorCode?: string | null; errorDescription?: string | null }
) {
  const amount = roundMoney((attempt.amountPaise ?? Math.round(Number(booking.totalPrice) * 100)) / 100);
  const result = await recordFailedPayment(db, {
    service: 'ticketing',
    amount,
    bookingId: String(booking._id),
    eventId: booking.eventId ? String(booking.eventId) : null,
    payeeType: booking.payeeType || null,
    payeeId: booking.payeeId || null,
    payeeName: await payeeNameOf(db, booking),
    customerPhone: booking.userPhone || null,
    gatewayOrderId: attempt.orderId || booking.gatewayOrderId || null,
    gatewayPaymentId: attempt.id,
    description: `Failed payment attempt for ${booking.eventTitle || 'event'}`,
    meta: {
      method: attempt.method || null,
      errorCode: attempt.errorCode || null,
      errorDescription: attempt.errorDescription || null,
    },
  });
  return result.payment as Record<string, any>;
}

/**
 * Does the work of one webhook delivery, from its trimmed payload. Returns a
 * short note about what was done; throws when the delivery should be tried
 * again. Every branch can run twice for the same delivery without doing its
 * work twice, which is what makes "replay" safe.
 */
export async function handleWebhookEvent(db: Db, event: string, payload: StoredWebhookPayload, actor = 'razorpay'): Promise<string> {
  if (event === 'payment.captured') {
    const entity = payload.payment;
    const booking = await bookingForOrder(db, entity?.order_id);
    if (!booking || !entity?.id) return 'No booking for this order';
    const base = { bookingId: String(booking._id), gatewayOrderId: entity.order_id, gatewayPaymentId: entity.id, amount: Number(entity.amount) / 100, actor };
    try {
      const result = await confirmPaidBooking(
        db,
        booking,
        { id: String(entity.id), orderId: entity.order_id, amountPaise: Number(entity.amount), method: entity.method || null },
        'webhook'
      );
      await logPaymentEvent(db, {
        ...base,
        kind: 'webhook',
        outcome: 'ok',
        message: 'payment.captured: ' + result.outcome.replace(/_/g, ' '),
        reference: result.booking?.ledgerReference || null,
      });
      return 'Booking ' + String(booking._id) + ': ' + result.outcome;
    } catch (error) {
      // A mismatch will not fix itself on a retry: record it and acknowledge.
      if (error instanceof BookingError && error.status !== 503) {
        await logPaymentEvent(db, { ...base, kind: 'webhook', outcome: 'refused', message: 'payment.captured not applied: ' + error.message });
        return 'Booking ' + String(booking._id) + ' not confirmed: ' + error.message;
      }
      throw error;
    }
  }

  if (event === 'payment.failed') {
    const entity = payload.payment;
    const booking = await bookingForOrder(db, entity?.order_id);
    if (!booking) return 'No booking for this order';
    const now = new Date();

    let reference: string | null = null;
    if (entity?.id) {
      const entry = await recordFailedAttempt(db, booking, {
        id: entity.id,
        orderId: entity.order_id,
        amountPaise: whole(entity.amount),
        method: entity.method,
        errorCode: entity.error_code,
        errorDescription: entity.error_description,
      });
      reference = entry?.reference || null;
    }

    const result = await db.collection('bookings').updateOne(
      { _id: booking._id, status: 'pending_payment' },
      {
        $set: {
          status: 'expired',
          paymentStatus: 'failed',
          expiredAt: now,
          expiredReason: 'Payment failed',
          failedGatewayPaymentId: entity?.id || null,
          paymentError: entity?.error_description || null,
          updatedAt: now,
        },
      }
    );
    const released = result.modifiedCount === 1;
    if (released) await releaseBooking(db, booking, 'payment_failed');
    await logPaymentEvent(db, {
      kind: 'payment_failed',
      outcome: 'failed',
      message: 'payment.failed' + (entity?.error_description ? ': ' + entity.error_description : ''),
      bookingId: String(booking._id),
      gatewayOrderId: entity?.order_id,
      gatewayPaymentId: entity?.id,
      reference,
      amount: entity?.amount != null ? Number(entity.amount) / 100 : null,
      actor,
      meta: { errorCode: entity?.error_code || null, method: entity?.method || null, seatsReleased: released },
    });
    return released
      ? 'Booking ' + String(booking._id) + ': marked failed, seats released'
      : 'Booking ' + String(booking._id) + ' was not awaiting payment; the failed attempt was recorded';
  }

  if (event === 'refund.processed' || event === 'refund.failed') {
    const entity = payload.refund;
    if (!entity?.id) return 'No refund id in the delivery';
    const processed = event === 'refund.processed';
    const now = new Date();
    const refunds = db.collection('refunds');
    const transactions = db.collection('transactions');

    let refund = await refunds.findOne({ gatewayRefundId: entity.id });
    // The gateway accepted the refund but its id was never saved: find it by the note this server sent.
    if (!refund && entity.notes?.refundId && /^[a-f0-9]{24}$/i.test(entity.notes.refundId)) {
      const byNote = await refunds.findOne({ _id: new ObjectId(entity.notes.refundId), gatewayRefundId: { $in: [null, ''] } });
      if (byNote) {
        await refunds.updateOne({ _id: byNote._id }, { $set: { gatewayRefundId: entity.id, updatedAt: now } });
        refund = { ...byNote, gatewayRefundId: entity.id };
      }
    }
    if (!refund) return 'No refund with gateway id ' + entity.id;

    const refundId = String(refund._id);
    const payment = await findPaymentEntry(db, refund);
    const log = (outcome: 'ok' | 'failed', message: string) =>
      logPaymentEvent(db, {
        kind: 'refund',
        outcome,
        message,
        bookingId: refund!.bookingId ? String(refund!.bookingId) : null,
        gatewayPaymentId: refund!.gatewayPaymentId || entity.payment_id || null,
        gatewayOrderId: payment?.gatewayOrderId || null,
        reference: payment?.reference || refund!.paymentReference || null,
        amount: Number(refund!.refundAmount) || null,
        actor,
        meta: { refundId, gatewayRefundId: entity.id },
      });

    if (processed) {
      if (refund.status === 'processed') return 'Refund ' + refundId + ' was already processed';
      if (!['processing', 'failed'].includes(String(refund.status))) {
        return 'Refund ' + refundId + ' is ' + refund.status + ', not being processed: ignored';
      }
      // The ledger entries are normally written when the refund is sent. They
      // are only written here if that never happened; never a second time.
      const outcome = await writeRefundLedger(db, refund, { adminEmail: refund.processedBy || null, gatewayRefundId: entity.id });
      // Entries switched off by an earlier refund.failed count again, and the
      // charges on the original payment are reversed again with them.
      const back = await transactions.updateMany(
        { 'meta.refundId': refundId, type: { $in: ['refund', 'refund_deduction'] }, status: 'failed' },
        { $set: { status: 'success', updatedAt: now } }
      );
      if (back.modifiedCount > 0 && payment?.reference) {
        await transactions.updateMany(
          { parentReference: payment.reference, type: { $in: ['commission', 'gst', 'gateway_fee'] }, status: 'success' },
          { $set: { status: 'refunded', updatedAt: now, 'meta.reversedByRefund': refundId } }
        );
      }
      await refunds.updateOne(
        { _id: refund._id, status: { $in: ['processing', 'failed'] } },
        {
          $set: {
            status: 'processed',
            processedAt: now,
            gatewayStatus: entity.status || 'processed',
            ledgerRecordedAt: refund.ledgerRecordedAt || now,
            ledgerReferences: outcome.entries.map((e: any) => e.reference),
            ledgerError: null,
            failureMessage: null,
            updatedAt: now,
          },
        }
      );
      if (refund.bookingId) {
        await db
          .collection('bookings')
          .updateOne(idFilter(String(refund.bookingId)), { $set: { paymentStatus: 'refunded', refundId, updatedAt: now } });
        // The booking itself says how the refund ended.
        const done = await refunds.findOne({ _id: refund._id });
        if (done) await writeBookingOutcome(db, done, { by: actor });
      }
      if (payment?.reference) await recomputeRefundState(db, [payment.reference]);
      await log('ok', 'refund.processed: the gateway completed the refund' + (outcome.written ? ' (ledger entries written now)' : ''));
      return 'Refund ' + refundId + ': processed' + (outcome.written ? ', ledger entries written' : '');
    }

    if (refund.status === 'processed') return 'Refund ' + refundId + ' was already processed: the failure was ignored';
    if (refund.status === 'failed') return 'Refund ' + refundId + ' was already marked failed';
    if (refund.status !== 'processing') return 'Refund ' + refundId + ' is ' + refund.status + ', not being processed: ignored';

    const moved = await refunds.updateOne(
      { _id: refund._id, status: 'processing' },
      {
        $set: {
          status: 'failed',
          failedAt: now,
          gatewayStatus: entity.status || 'failed',
          failureMessage: 'Razorpay reported that this refund failed. The customer has not received the money.',
          updatedAt: now,
        },
      }
    );
    if (moved.modifiedCount !== 1) return 'Refund ' + refundId + ' changed while the failure was being applied';
    // The money did not leave: the entries written when the refund was sent stop counting.
    const off = await transactions.updateMany(
      { 'meta.refundId': refundId, type: { $in: ['refund', 'refund_deduction'] }, status: 'success' },
      { $set: { status: 'failed', failedByGatewayAt: now, updatedAt: now } }
    );
    // The commission, GST and gateway fee that were reversed for this refund are charged again.
    await transactions.updateMany(
      { 'meta.reversedByRefund': refundId, type: { $in: ['commission', 'gst', 'gateway_fee'] }, status: 'refunded' },
      { $set: { status: 'success', updatedAt: now }, $unset: { 'meta.reversedByRefund': '' } }
    );
    if (refund.bookingId) {
      await db
        .collection('bookings')
        .updateOne(
          { ...idFilter(String(refund.bookingId)), paymentStatus: 'refunded', refundId },
          { $set: { paymentStatus: 'refund_requested', updatedAt: now } }
        );
      const failed = await refunds.findOne({ _id: refund._id });
      if (failed) await writeBookingOutcome(db, failed, { by: actor });
    }
    if (payment?.reference) await recomputeRefundState(db, [payment.reference]);
    await log('failed', 'refund.failed: the gateway could not complete the refund');
    return 'Refund ' + refundId + ': failed, ' + off.modifiedCount + ' ledger entries switched off';
  }

  if (event === 'payment.dispute.created' || event === 'payment.dispute.won' || event === 'payment.dispute.lost') {
    const paymentId = payload.dispute?.payment_id || payload.payment?.id;
    if (!paymentId) return 'No payment id in the delivery';
    const payment = await db.collection('transactions').findOne({ type: 'payment', gatewayPaymentId: paymentId });
    if (!payment) return 'No ledger payment for ' + paymentId;
    const input = {
      by: actor,
      source: 'gateway' as const,
      gatewayDisputeId: payload.dispute?.id || null,
      reason:
        event === 'payment.dispute.created'
          ? 'Dispute raised at the gateway' + (payload.dispute?.reason_code ? ' (' + payload.dispute.reason_code + ')' : '')
          : event === 'payment.dispute.won'
          ? 'The gateway reported the dispute won'
          : 'The gateway reported the dispute lost',
    };
    const result =
      event === 'payment.dispute.created'
        ? await openDispute(db, payment, input)
        : event === 'payment.dispute.won'
        ? await clearDispute(db, payment, input)
        : await loseDispute(db, payment, input);
    await logPaymentEvent(db, {
      kind: 'dispute',
      outcome: result.ok ? 'ok' : 'refused',
      message: event + ': ' + (result.ok ? 'payment is now ' + result.status : result.error),
      bookingId: payment.bookingId || null,
      gatewayOrderId: payment.gatewayOrderId || null,
      gatewayPaymentId: paymentId,
      reference: payment.reference,
      amount: payment.amount,
      actor,
      meta: { gatewayDisputeId: input.gatewayDisputeId },
    });
    return 'Payment ' + payment.reference + ': ' + (result.ok ? result.status : result.error);
  }

  return 'Event not handled';
}
