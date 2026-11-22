import type { Db } from 'mongodb';
import { COUPON_DISCOUNT_KIND, recordTransaction, roundMoney, SERVICES, type Service } from '@/lib/ledger';
import { idFilter, toObjectId } from '@/lib/http';
import { eventStart as bookingEventStart } from '@/lib/bookings';

export const REFUND_STATUSES = [
  'requested',
  'awaiting_second_approval',
  'approved',
  'rejected',
  'processing',
  'processed',
  'failed',
  'disputed',
] as const;

export function serialiseDoc<T extends Record<string, any>>(doc: T): T {
  return { ...doc, _id: String(doc._id) };
}

export function asService(value: unknown): Service {
  return SERVICES.some((s) => s.value === value) ? (value as Service) : 'ticketing';
}

/**
 * When an event starts, or null when its date cannot be read. The same reading
 * (India time) as the customer's own cancellation, so an admin and a customer
 * are always quoted the same rule.
 */
export const eventStart = bookingEventStart;

/** One sentence that says how a refund ended, or that it is still open. */
export function refundOutcome(refund: Record<string, any>): { final: boolean; text: string } {
  const money = '₹' + roundMoney(Number(refund.refundAmount) || 0).toLocaleString('en-IN');
  switch (String(refund.status)) {
    case 'processed':
      return {
        final: true,
        text:
          `Refunded: ${money} returned to the customer` +
          (refund.manualReference ? ` by direct transfer (reference ${refund.manualReference}).` : refund.gatewayRefundId ? ` through the gateway (refund ${refund.gatewayRefundId}).` : '.'),
      };
    case 'rejected':
      return { final: true, text: `Rejected: no money was returned.${refund.rejectionReason ? ' Reason: ' + refund.rejectionReason : ''}` };
    case 'processing':
      return refund.gatewayRefundId
        ? { final: false, text: `In progress: the gateway has accepted the refund of ${money} and has not confirmed it yet.` }
        : { final: false, text: `Not known: the refund of ${money} was being sent to the gateway and no answer was recorded. Check its status.` };
    case 'failed':
      return { final: false, text: `Not completed: the refund of ${money} failed and has not been returned yet.` };
    case 'disputed':
      return { final: false, text: `Open: disputed.${refund.disputeReason ? ' Reason: ' + refund.disputeReason : ''}` };
    case 'approved':
      return { final: false, text: `Open: approved, ${money} not yet sent.` };
    case 'awaiting_second_approval':
      return { final: false, text: 'Open: waiting for the second approval.' };
    default:
      return { final: false, text: 'Open: waiting for approval.' };
  }
}

/**
 * Copies the state of the refund onto its booking, so the booking itself says
 * how the refund ended. `paymentStatus` is only changed when given.
 */
export async function writeBookingOutcome(
  db: Db,
  refund: Record<string, any>,
  options: { paymentStatus?: string; by: string | null }
) {
  if (!refund.bookingId) return;
  const outcome = refundOutcome(refund);
  const now = new Date();
  const set: Record<string, any> = {
    refundOutcome: {
      refundId: String(refund._id),
      status: String(refund.status),
      final: outcome.final,
      text: outcome.text,
      refundAmount: roundMoney(Number(refund.refundAmount) || 0),
      deductionAmount: roundMoney(Number(refund.deductionAmount) || 0),
      reason: refund.rejectionReason || refund.disputeReason || null,
      reference: refund.manualReference || refund.gatewayRefundId || null,
      updatedAt: now,
      updatedBy: options.by,
    },
    updatedAt: now,
  };
  if (options.paymentStatus) set.paymentStatus = options.paymentStatus;
  await db.collection('bookings').updateOne({ ...idFilter(String(refund.bookingId)), refundId: String(refund._id) }, { $set: set });
}

/** The ledger entry of the customer payment a refund returns, if there is one. */
export async function findPaymentEntry(db: Db, refund: Record<string, any>) {
  const or: Record<string, any>[] = [];
  if (refund.paymentReference) or.push({ reference: String(refund.paymentReference) });
  if (refund.gatewayPaymentId) or.push({ gatewayPaymentId: String(refund.gatewayPaymentId) });
  if (refund.bookingId) or.push({ bookingId: String(refund.bookingId) });
  if (or.length === 0) return null;
  return db.collection('transactions').findOne({ type: 'payment', $or: or });
}

export async function loadBooking(db: Db, bookingId: unknown) {
  if (bookingId === null || bookingId === undefined || bookingId === '') return null;
  return db.collection('bookings').findOne(idFilter(String(bookingId)));
}

export async function loadEvent(db: Db, eventId: unknown) {
  const oid = toObjectId(typeof eventId === 'string' ? eventId : String(eventId || ''));
  if (!oid) return null;
  return db.collection('events').findOne({ _id: oid }, { projection: { media: 0, scannerStaff: 0 } });
}

/**
 * Writes the ledger entries for a refund that has been sent to the customer:
 * a `refund` entry for the amount returned and, when something was kept under
 * the refund rule, a separate `refund_deduction` entry.
 *
 * Never writes twice: if entries for this refund already exist they are
 * returned and nothing is added.
 *
 * The payee is charged with the refund only when the original payment is in
 * the ledger (so the payee was credited with it). A booking that was never
 * verified with the gateway has no payment entry; its refund is recorded
 * against the platform and the organiser's balance is left alone.
 */
export async function writeRefundLedger(
  db: Db,
  refund: Record<string, any>,
  options: { adminEmail: string | null; gatewayRefundId?: string | null; manualReference?: string | null }
) {
  const refundId = String(refund._id);
  const transactions = db.collection('transactions');

  // Entries left in status 'failed' by an earlier gateway failure are counted
  // again now that the refund has gone through; nothing is written twice.
  await transactions.updateMany(
    { 'meta.refundId': refundId, type: { $in: ['refund', 'refund_deduction'] }, status: 'failed' },
    { $set: { status: 'success', updatedAt: new Date() } }
  );

  const existing = await transactions
    .find({ 'meta.refundId': refundId, type: { $in: ['refund', 'refund_deduction'] } })
    .toArray();
  const hasRefund = existing.some((e) => e.type === 'refund');
  const hasDeduction = existing.some((e) => e.type === 'refund_deduction');

  const payment = await findPaymentEntry(db, refund);
  const hasPayment = Boolean(payment);

  const base = {
    service: asService(refund.service || payment?.service),
    status: 'success' as const,
    bookingId: refund.bookingId ? String(refund.bookingId) : null,
    eventId: refund.eventId ? String(refund.eventId) : payment?.eventId || null,
    payeeType: hasPayment ? refund.payeeType || payment!.payeeType || null : ('platform' as const),
    payeeId: hasPayment ? String(refund.payeeId || payment!.payeeId || '') || null : null,
    payeeName: hasPayment ? payment!.payeeName || null : null,
    customerPhone: refund.customerPhone || payment?.customerPhone || null,
    gatewayOrderId: payment?.gatewayOrderId || null,
    gatewayPaymentId: refund.gatewayPaymentId || payment?.gatewayPaymentId || null,
    parentReference: payment?.reference || refund.paymentReference || null,
    ruleId: refund.ruleId ? String(refund.ruleId) : null,
    ruleSnapshot: refund.ruleSnapshot || null,
    createdBy: options.adminEmail,
    meta: {
      refundId,
      gatewayRefundId: options.gatewayRefundId || null,
      manualReference: options.manualReference || null,
      ...(hasPayment
        ? {}
        : {
            noLedgerPayment: true,
            intendedPayeeType: refund.payeeType || null,
            intendedPayeeId: refund.payeeId ? String(refund.payeeId) : null,
          }),
    },
  };

  const entries: Record<string, any>[] = [...existing];
  const refundAmount = roundMoney(Number(refund.refundAmount) || 0);
  const deduction = roundMoney(Number(refund.deductionAmount) || 0);
  if (hasRefund && (hasDeduction || deduction <= 0)) return { written: false, entries };

  if (!hasRefund) {
    entries.push(
      await recordTransaction(db, {
        ...base,
        type: 'refund',
        amount: refundAmount,
        description: `Refund to customer for booking ${base.bookingId || ''}`.trim(),
      })
    );
  }

  if (deduction > 0 && !hasDeduction) {
    entries.push(
      await recordTransaction(db, {
        ...base,
        type: 'refund_deduction',
        amount: deduction,
        description: `Amount kept under the refund rule for booking ${base.bookingId || ''}`.trim(),
      })
    );
  }

  // The booking is cancelled, so the payee earns nothing from it: the
  // commission, GST and gateway fee taken on the original payment are marked
  // refunded and stop counting. The platform's income from this booking is
  // then the amount kept under the refund rule (the refund_deduction entry).
  if (payment?.reference) {
    await transactions.updateMany(
      {
        parentReference: payment.reference,
        type: { $in: ['commission', 'gst', 'gateway_fee'] },
        status: 'success',
      },
      { $set: { status: 'refunded', updatedAt: new Date(), 'meta.reversedByRefund': refundId } }
    );
    // A platform-funded coupon discount is not owed for a cancelled booking either.
    await transactions.updateMany(
      { parentReference: payment.reference, type: 'adjustment', 'meta.kind': COUPON_DISCOUNT_KIND, status: 'success' },
      { $set: { status: 'refunded', updatedAt: new Date(), 'meta.reversedByRefund': refundId, 'meta.statusFollows': 'payment' } }
    );
  }

  return { written: true, entries };
}
