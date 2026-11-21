import type { Db } from 'mongodb';
import { idFilter } from '@/lib/http';
import { DERIVED_TYPES, recordTransaction, roundMoney } from '@/lib/ledger';

/**
 * Payment states that are not a plain ledger status.
 *
 * REFUNDS. A refund never changes the status of the payment entry: the money
 * was received, so it stays in gross transaction value, and the refund is its
 * own entry. What changes is the payment's refund state, kept on the payment
 * entry (`refundedAmount`, `refundDeductions`, `refundState`) so the Payments
 * screen can list a fully refunded payment under "Refunded" and show a partly
 * refunded one under "Successful" with the amount returned.
 *
 * DISPUTES. While a payment is disputed, the payment AND every entry derived
 * from it (commission, GST, gateway fee, refunds, refund deductions) carry
 * status 'disputed'. Every figure in the panel counts 'success' entries only,
 * so the whole transaction is set aside: out of gross value, revenue, GST,
 * fees and the payee's balance, which holds the amount back from settlement.
 *  - Cleared (won): every entry returns to 'success'.
 *  - Lost (chargeback): the payment returns to 'success', its commission, GST
 *    and gateway fee are marked 'refunded' (reversed), and a `refund` entry is
 *    written for whatever had not already been refunded. The payment is then
 *    fully refunded.
 */

const REFUND_TYPES = ['refund', 'refund_deduction'];
const CHARGE_TYPES = ['commission', 'gst', 'gateway_fee'];
const SYNC_KEY = 'paymentRefunds';

export function paymentStateFilter(status: string): Record<string, any> {
  if (status === 'success') return { status: 'success', refundState: { $ne: 'full' } };
  if (status === 'refunded') return { $or: [{ status: 'refunded' }, { status: 'success', refundState: 'full' }] };
  return { status };
}

/** The state shown on the Payments screen for a ledger payment entry. */
export function displayStatus(payment: Record<string, any>): string {
  if (payment.status === 'success' && payment.refundState === 'full') return 'refunded';
  return String(payment.status || '');
}

/** Recomputes the refund state of the given payments from their refund entries. */
export async function recomputeRefundState(db: Db, references: string[]): Promise<void> {
  const refs = Array.from(new Set(references.filter(Boolean)));
  if (refs.length === 0) return;
  const transactions = db.collection('transactions');

  const [rows, payments] = await Promise.all([
    transactions
      .aggregate([
        // A refund set aside by a dispute was still paid out, so it still counts here.
        { $match: { type: { $in: REFUND_TYPES }, parentReference: { $in: refs }, status: { $in: ['success', 'disputed'] } } },
        { $group: { _id: { reference: '$parentReference', type: '$type' }, total: { $sum: '$amount' } } },
      ])
      .toArray(),
    transactions
      .find({ type: 'payment', reference: { $in: refs } })
      .project({ reference: 1, amount: 1, refundedAmount: 1, refundDeductions: 1, refundState: 1 })
      .toArray(),
  ]);

  const now = new Date();
  for (const payment of payments) {
    const own = rows.filter((row) => row._id.reference === payment.reference);
    const refunded = roundMoney(own.filter((row) => row._id.type === 'refund').reduce((t, row) => t + row.total, 0));
    const deductions = roundMoney(own.filter((row) => row._id.type === 'refund_deduction').reduce((t, row) => t + row.total, 0));
    const returned = roundMoney(refunded + deductions);
    const state = returned <= 0 ? null : returned >= roundMoney(Number(payment.amount) || 0) - 0.005 ? 'full' : 'partial';
    if (
      roundMoney(Number(payment.refundedAmount) || 0) === refunded &&
      roundMoney(Number(payment.refundDeductions) || 0) === deductions &&
      (payment.refundState ?? null) === state
    ) {
      continue;
    }
    await transactions.updateOne(
      { _id: payment._id },
      { $set: { refundedAmount: refunded, refundDeductions: deductions, refundState: state, refundSyncedAt: now } }
    );
  }
}

/**
 * Brings the refund state of payments up to date with refund entries written
 * since the last run (refunds are written by the refund screens, which do not
 * know about this state), and holds back the derived entries of payments that
 * were marked disputed before that rule existed. Cheap when nothing changed.
 */
export async function syncPaymentStates(db: Db): Promise<void> {
  const transactions = db.collection('transactions');
  const state = db.collection('syncState');
  const startedAt = new Date();

  const marker = await state.findOne({ key: SYNC_KEY });
  const since: Date | null = marker?.watermark ? new Date(marker.watermark) : null;
  const filter: Record<string, any> = { type: { $in: REFUND_TYPES }, parentReference: { $type: 'string' } };
  if (since) filter.$or = [{ createdAt: { $gt: since } }, { updatedAt: { $gt: since } }];

  const references = (await transactions.distinct('parentReference', filter)) as string[];
  for (let index = 0; index < references.length; index += 500) {
    await recomputeRefundState(db, references.slice(index, index + 500));
  }
  // A few seconds of overlap: recomputing is harmless, missing an entry is not.
  await state.updateOne({ key: SYNC_KEY }, { $set: { key: SYNC_KEY, watermark: new Date(startedAt.getTime() - 5000) } }, { upsert: true });

  const legacy = await transactions
    .find({ type: 'payment', status: 'disputed', 'dispute.derivedHeld': { $ne: true } })
    .project({ reference: 1 })
    .limit(500)
    .toArray();
  for (const payment of legacy) {
    await holdDerived(db, String(payment.reference), startedAt);
    await transactions.updateOne({ _id: payment._id }, { $set: { 'dispute.derivedHeld': true } });
  }
}

async function holdDerived(db: Db, reference: string, now: Date) {
  const result = await db
    .collection('transactions')
    .updateMany(
      { parentReference: reference, type: { $in: DERIVED_TYPES as unknown as string[] }, status: 'success' },
      { $set: { status: 'disputed', statusBeforeDispute: 'success', updatedAt: now } }
    );
  return result.modifiedCount;
}

export interface DisputeInput {
  /** An admin's email, or 'razorpay' when the gateway reported it. */
  by: string;
  reason: string;
  source: 'admin' | 'gateway';
  gatewayDisputeId?: string | null;
}

export type DisputeResult =
  | { ok: true; status: string; entriesChanged: number; refundReference?: string | null; refundAmount?: number }
  | { ok: false; error: string; status: number };

const refuse = (error: string, status = 409): DisputeResult => ({ ok: false, error, status });

/** Marks a payment disputed and sets it and its derived entries aside. */
export async function openDispute(db: Db, payment: Record<string, any>, input: DisputeInput): Promise<DisputeResult> {
  if (payment.status === 'disputed') return refuse('This payment is already marked as disputed.');
  if (payment.status === 'failed') return refuse('A failed payment cannot be disputed: no money was received.');
  if (payment.status !== 'success') return refuse('Only a successful payment can be disputed.');
  if (payment.refundState === 'full') return refuse('This payment has already been refunded in full, so there is nothing left to dispute.');

  const now = new Date();
  const transactions = db.collection('transactions');
  // The status in the filter stops two admins applying the same change twice.
  const won = await transactions.updateOne(
    { _id: payment._id, status: 'success' },
    {
      $set: {
        status: 'disputed',
        statusBeforeDispute: 'success',
        updatedAt: now,
        dispute: {
          openedAt: now,
          openedBy: input.by,
          source: input.source,
          reason: input.reason,
          gatewayDisputeId: input.gatewayDisputeId || null,
          derivedHeld: true,
          outcome: null,
        },
      },
      $push: { notes: { text: input.reason, action: 'dispute', from: 'success', to: 'disputed', by: input.by, at: now } } as any,
    }
  );
  if (won.modifiedCount !== 1) return refuse('The payment was changed by someone else. Reload and try again.');
  const entriesChanged = await holdDerived(db, String(payment.reference), now);
  return { ok: true, status: 'disputed', entriesChanged };
}

/** The dispute was decided in the merchant's favour (or raised by mistake): everything counts again. */
export async function clearDispute(db: Db, payment: Record<string, any>, input: DisputeInput): Promise<DisputeResult> {
  if (payment.status !== 'disputed') return refuse('This payment is not disputed.');
  const now = new Date();
  const transactions = db.collection('transactions');
  const back = ['success', 'refunded'].includes(payment.statusBeforeDispute) ? payment.statusBeforeDispute : 'success';
  const won = await transactions.updateOne(
    { _id: payment._id, status: 'disputed' },
    {
      $set: { status: back, updatedAt: now, 'dispute.outcome': 'cleared', 'dispute.closedAt': now, 'dispute.closedBy': input.by },
      $push: { notes: { text: input.reason, action: 'clear_dispute', from: 'disputed', to: back, by: input.by, at: now } } as any,
    }
  );
  if (won.modifiedCount !== 1) return refuse('The payment was changed by someone else. Reload and try again.');
  const restored = await transactions.updateMany(
    { parentReference: payment.reference, type: { $in: DERIVED_TYPES as unknown as string[] }, status: 'disputed' },
    { $set: { status: 'success', updatedAt: now } }
  );
  await recomputeRefundState(db, [String(payment.reference)]);
  return { ok: true, status: back, entriesChanged: restored.modifiedCount };
}

/**
 * The dispute was lost: the gateway took the money back (a chargeback). The
 * payment is unwound as a full refund, recorded in the ledger and as a
 * processed record in `refunds`, and the booking stops being a paid ticket.
 */
export async function loseDispute(db: Db, payment: Record<string, any>, input: DisputeInput): Promise<DisputeResult> {
  if (payment.status !== 'disputed') return refuse('This payment is not disputed.');
  const now = new Date();
  const transactions = db.collection('transactions');
  const reference = String(payment.reference);

  const won = await transactions.updateOne(
    { _id: payment._id, status: 'disputed' },
    {
      $set: { status: 'success', updatedAt: now, 'dispute.outcome': 'lost', 'dispute.closedAt': now, 'dispute.closedBy': input.by },
      $push: { notes: { text: input.reason, action: 'dispute_lost', from: 'disputed', to: 'refunded', by: input.by, at: now } } as any,
    }
  );
  if (won.modifiedCount !== 1) return refuse('The payment was changed by someone else. Reload and try again.');

  // Refunds already paid count again; the charges on the payment are reversed.
  await transactions.updateMany(
    { parentReference: reference, type: { $in: REFUND_TYPES }, status: 'disputed' },
    { $set: { status: 'success', updatedAt: now } }
  );
  const reversed = await transactions.updateMany(
    { parentReference: reference, type: { $in: CHARGE_TYPES }, status: { $in: ['disputed', 'success'] } },
    { $set: { status: 'refunded', reversedBy: 'dispute_lost', updatedAt: now } }
  );

  const [returned] = await transactions
    .aggregate([
      { $match: { parentReference: reference, type: { $in: REFUND_TYPES }, status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ])
    .toArray();
  const amount = roundMoney(Number(payment.amount) || 0);
  const remaining = roundMoney(Math.max(0, amount - (returned?.total || 0)));

  let refundReference: string | null = null;
  if (remaining > 0) {
    const refundDoc = {
      bookingId: payment.bookingId ? String(payment.bookingId) : null,
      service: payment.service || 'ticketing',
      customerPhone: payment.customerPhone || null,
      eventId: payment.eventId || null,
      eventTitle: '',
      payeeType: payment.payeeType || null,
      payeeId: payment.payeeId || null,
      paymentReference: reference,
      gatewayPaymentId: payment.gatewayPaymentId || null,
      amountPaid: amount,
      refundPercent: Math.round((remaining / (amount || 1)) * 10000) / 100,
      deductionAmount: 0,
      refundAmount: remaining,
      ruleId: null,
      ruleSnapshot: null,
      reason: 'Dispute lost (chargeback): ' + input.reason,
      requestedBy: input.by,
      source: 'chargeback',
      status: 'processed',
      firstApprover: input.source === 'admin' ? input.by : null,
      secondApprover: null,
      gatewayRefundId: null,
      gatewayDisputeId: input.gatewayDisputeId || payment.dispute?.gatewayDisputeId || null,
      processedAt: now,
      ledgerRecordedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    if (refundDoc.bookingId) {
      const booking = await db.collection('bookings').findOne(idFilter(refundDoc.bookingId), { projection: { eventTitle: 1 } });
      refundDoc.eventTitle = booking?.eventTitle || '';
    }
    const inserted = await db.collection('refunds').insertOne(refundDoc);
    const refundId = String(inserted.insertedId);

    const entry = await recordTransaction(db, {
      type: 'refund',
      service: payment.service,
      amount: remaining,
      status: 'success',
      bookingId: payment.bookingId || null,
      eventId: payment.eventId || null,
      payeeType: payment.payeeType || null,
      payeeId: payment.payeeId || null,
      payeeName: payment.payeeName || null,
      customerPhone: payment.customerPhone || null,
      gatewayOrderId: payment.gatewayOrderId || null,
      gatewayPaymentId: payment.gatewayPaymentId || null,
      parentReference: reference,
      description: `Chargeback: dispute lost on payment ${reference}`,
      createdBy: input.by,
      meta: { refundId, chargeback: true, gatewayDisputeId: refundDoc.gatewayDisputeId },
    });
    refundReference = entry.reference;
    await db.collection('refunds').updateOne({ _id: inserted.insertedId }, { $set: { ledgerReferences: [entry.reference] } });

    if (refundDoc.bookingId) {
      await db
        .collection('bookings')
        .updateOne(idFilter(refundDoc.bookingId), { $set: { paymentStatus: 'refunded', chargebackAt: now, chargebackRefundId: refundId, updatedAt: now } });
    }
  }

  await recomputeRefundState(db, [reference]);
  return { ok: true, status: 'refunded', entriesChanged: reversed.modifiedCount, refundReference, refundAmount: remaining };
}
