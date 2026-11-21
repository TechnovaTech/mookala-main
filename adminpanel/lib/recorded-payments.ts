import type { Db } from 'mongodb';
import { computeCharges, getCommissionRule, recordTransaction, type Service } from './ledger';

/**
 * Ledger entries for payments that the team records by hand in the admin panel
 * (course enrolments, membership payments, advertiser invoices). These
 * services are not sold through the apps or the payment gateway yet, so the
 * ledger would otherwise never see them, and the dashboard, reports and
 * settlements would show nothing for them.
 *
 * Each recorded payment writes one `payment` entry (plus commission, GST and
 * gateway fee when a commission rule is in force for the service and the money
 * is owed to someone else), marked `meta.source: 'recorded_by_admin'`, so it is
 * always possible to tell it apart from a payment verified with the gateway.
 * A record is written to the ledger once, however often the hook runs.
 */

export interface RecordedPayment {
  /** Stable key for the source record, e.g. "enrolment:<id>". */
  key: string;
  service: Service;
  amount: number;
  payeeType: 'instructor' | 'platform' | 'organizer' | 'artist' | 'cinema' | 'advertiser';
  payeeId?: string | null;
  payeeName?: string | null;
  customerPhone?: string | null;
  description: string;
  createdBy?: string | null;
  /** GST collected on top of `amount`, when the record states it separately. */
  gstCollected?: number;
}

function sourceMeta(key: string) {
  return { recordKey: key, source: 'recorded_by_admin' };
}

export async function recordManualPayment(db: Db, input: RecordedPayment) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const transactions = db.collection('transactions');
  const existing = await transactions.findOne({ type: 'payment', 'meta.recordKey': input.key });
  if (existing) return existing;

  const base = {
    service: input.service,
    payeeType: input.payeeType,
    payeeId: input.payeeId || null,
    payeeName: input.payeeName || null,
    customerPhone: input.customerPhone || null,
    createdBy: input.createdBy || null,
    status: 'success' as const,
  };

  // Commission applies only when the money is owed on to someone else.
  const rule = input.payeeType === 'platform' ? null : await getCommissionRule(db, input.service);
  // No payment gateway handled this money, so no gateway fee is charged on it.
  const charges = computeCharges(amount, rule ? { ...rule, gatewayFeePercent: 0 } : null);
  const ruleSnapshot = rule
    ? {
        ratePercent: rule.ratePercent,
        minFee: rule.minFee ?? null,
        maxFee: rule.maxFee ?? null,
        gstPercent: rule.gstPercent ?? null,
        gatewayFeePercent: rule.gatewayFeePercent ?? null,
        effectiveFrom: rule.effectiveFrom,
      }
    : null;

  const payment = await recordTransaction(db, {
    ...base,
    type: 'payment',
    amount,
    description: input.description,
    ruleId: rule?._id ? String(rule._id) : null,
    ruleSnapshot,
    meta: { ...sourceMeta(input.key), net: charges.net },
  });

  const derived = { ...base, parentReference: payment.reference, description: input.description, meta: sourceMeta(input.key) };
  if (charges.commission > 0) await recordTransaction(db, { ...derived, type: 'commission', amount: charges.commission, ruleSnapshot });
  if (charges.gst > 0) await recordTransaction(db, { ...derived, type: 'gst', amount: charges.gst, ruleSnapshot });
  if (charges.gatewayFee > 0) await recordTransaction(db, { ...derived, type: 'gateway_fee', amount: charges.gatewayFee, ruleSnapshot });
  if (input.gstCollected && input.gstCollected > 0) {
    // GST the customer paid on the sale itself. Marked so statements can keep it
    // apart from the GST charged on the platform's commission.
    await recordTransaction(db, {
      ...derived,
      type: 'gst',
      amount: input.gstCollected,
      description: `GST collected: ${input.description}`,
      meta: { ...sourceMeta(input.key), gstKind: 'collected_on_sale' },
    });
  }

  return payment;
}

/** Writes the refund for a recorded payment, once. Does nothing if the payment was never recorded. */
export async function recordManualRefund(db: Db, key: string, description: string, createdBy?: string | null) {
  const transactions = db.collection('transactions');
  const payment = await transactions.findOne({ type: 'payment', 'meta.recordKey': key });
  if (!payment) return null;

  const already = await transactions.findOne({ type: 'refund', 'meta.recordKey': key });
  if (already) return already;

  // The whole payment is returned, so the commission and GST taken on it are
  // returned too. Their entries are kept, marked refunded, and no longer count
  // against the payee's balance.
  await transactions.updateMany(
    { 'meta.recordKey': key, type: { $in: ['commission', 'gst', 'gateway_fee'] }, status: 'success' },
    { $set: { status: 'refunded', updatedAt: new Date() } }
  );

  return recordTransaction(db, {
    type: 'refund',
    service: payment.service,
    amount: payment.amount,
    status: 'success',
    payeeType: payment.payeeType,
    payeeId: payment.payeeId,
    payeeName: payment.payeeName,
    customerPhone: payment.customerPhone,
    parentReference: payment.reference,
    description,
    createdBy: createdBy || null,
    meta: sourceMeta(key),
  });
}
