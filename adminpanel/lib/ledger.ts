import crypto from 'crypto';
import { ObjectId, type Db } from 'mongodb';

/**
 * The financial ledger.
 *
 * Every money movement is one document in the `transactions` collection.
 * Commission, GST, gateway charges, refunds, refund deductions and payouts are
 * separate entries with their own `type`, never folded into one number, so
 * every report can be traced back to the entries that produced it.
 *
 * Entries are append-only. A correction is a new `adjustment` entry.
 */

export const SERVICES = [
  { value: 'ticketing', label: 'Event ticketing' },
  { value: 'artist_booking', label: 'Artist booking' },
  { value: 'learning', label: 'Learning' },
  { value: 'wishes', label: 'Wishes & greetings' },
  { value: 'membership', label: 'Membership' },
  { value: 'advertising', label: 'Advertising' },
  { value: 'premium_search', label: 'Premium search pass' },
] as const;

export type Service = (typeof SERVICES)[number]['value'];

export type TransactionType =
  | 'payment' // money received from a customer (gross)
  | 'commission' // the platform's commission on a payment
  | 'gst' // GST charged on the commission
  | 'gateway_fee' // charge kept by the payment gateway
  | 'refund' // money returned to a customer
  | 'refund_deduction' // part of a refund the platform keeps under the refund rule
  | 'settlement' // payout to an organiser, artist, instructor or cinema
  | 'adjustment'; // manual correction, always with a reason

export type TransactionStatus = 'pending' | 'success' | 'failed' | 'refunded' | 'disputed';

export interface TransactionInput {
  type: TransactionType;
  service: Service;
  /** Rupees, always positive. The `type` says which way the money moved. */
  amount: number;
  status: TransactionStatus;
  bookingId?: string | null;
  eventId?: string | null;
  /** Who the money is ultimately owed to. */
  payeeType?: 'organizer' | 'artist' | 'instructor' | 'cinema' | 'advertiser' | 'platform' | null;
  payeeId?: string | null;
  payeeName?: string | null;
  customerPhone?: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  /** Reference of the payment entry this one was derived from. */
  parentReference?: string | null;
  description?: string;
  /** The commission or refund rule that produced the entry. */
  ruleId?: string | null;
  ruleSnapshot?: Record<string, any> | null;
  createdBy?: string | null;
  meta?: Record<string, any>;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function newReference(prefix: string): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${day}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const PREFIX: Record<TransactionType, string> = {
  payment: 'PAY',
  commission: 'COM',
  gst: 'GST',
  gateway_fee: 'GWF',
  refund: 'RFD',
  refund_deduction: 'RFX',
  settlement: 'STL',
  adjustment: 'ADJ',
};

export async function recordTransaction(db: Db, input: TransactionInput) {
  const now = new Date();
  const doc = {
    reference: newReference(PREFIX[input.type]),
    currency: 'INR',
    ...input,
    amount: roundMoney(Math.abs(input.amount)),
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection('transactions').insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/* ------------------------------------------------------------------ */
/* Commission rules                                                    */
/* ------------------------------------------------------------------ */

export interface CommissionRule {
  _id?: any;
  service: Service;
  ratePercent: number;
  minFee?: number | null;
  maxFee?: number | null;
  gstPercent?: number | null;
  gatewayFeePercent?: number | null;
  effectiveFrom: Date;
  status: string;
}

/**
 * The rule in force for a service at a point in time: the active rule with the
 * latest `effectiveFrom` that is not in the future. Returns null when the
 * owner has not configured one. Nothing is assumed in that case.
 */
export async function getCommissionRule(db: Db, service: Service, at = new Date()): Promise<CommissionRule | null> {
  const rule = await db
    .collection('commissionRules')
    .find({ service, status: 'active', effectiveFrom: { $lte: at } })
    .sort({ effectiveFrom: -1 })
    .limit(1)
    .next();
  return (rule as unknown as CommissionRule) || null;
}

export interface Charges {
  gross: number;
  commission: number;
  gst: number;
  gatewayFee: number;
  /** What the payee is owed: gross minus commission, GST and gateway fee. */
  net: number;
}

export function computeCharges(gross: number, rule: CommissionRule | null): Charges {
  if (!rule) return { gross: roundMoney(gross), commission: 0, gst: 0, gatewayFee: 0, net: roundMoney(gross) };

  let commission = (gross * (rule.ratePercent || 0)) / 100;
  if (rule.minFee != null && commission < rule.minFee) commission = rule.minFee;
  if (rule.maxFee != null && rule.maxFee > 0 && commission > rule.maxFee) commission = rule.maxFee;
  commission = Math.min(commission, gross);

  const gst = (commission * (rule.gstPercent || 0)) / 100;
  const gatewayFee = (gross * (rule.gatewayFeePercent || 0)) / 100;

  return {
    gross: roundMoney(gross),
    commission: roundMoney(commission),
    gst: roundMoney(gst),
    gatewayFee: roundMoney(gatewayFee),
    net: roundMoney(Math.max(0, gross - commission - gst - gatewayFee)),
  };
}

/**
 * Writes the ledger entries for one successful customer payment: the payment
 * itself, then the commission, GST and gateway fee derived from the commission
 * rule in force. Safe to call twice for the same gateway payment: the second
 * call returns the existing payment entry and writes nothing.
 */
let paymentIndexReady: Promise<unknown> | null = null;

/**
 * One payment entry per gateway payment, enforced by the database, so two
 * requests confirming the same payment at the same moment cannot both write it.
 */
function ensurePaymentIndex(db: Db) {
  if (!paymentIndexReady) {
    paymentIndexReady = db
      .collection('transactions')
      .createIndex(
        { gatewayPaymentId: 1 },
        {
          unique: true,
          name: 'one_payment_per_gateway_payment',
          partialFilterExpression: { type: 'payment', gatewayPaymentId: { $type: 'string' } },
        }
      )
      .catch((error) => {
        paymentIndexReady = null;
        console.error('Could not create the unique payment index:', error?.message || error);
      });
  }
  return paymentIndexReady;
}

export async function recordPaymentWithCharges(
  db: Db,
  input: Omit<TransactionInput, 'type' | 'status'> & { gatewayPaymentId: string }
) {
  await ensurePaymentIndex(db);

  const existing = await db
    .collection('transactions')
    .findOne({ type: 'payment', gatewayPaymentId: input.gatewayPaymentId });
  // An attempt the gateway first reported as failed can be captured later
  // ("late authorisation"). Its failed entry then becomes the payment.
  if (existing && existing.status === 'failed') return upgradeFailedPayment(db, existing, input);
  if (existing) return { payment: existing, charges: null, duplicate: true };

  const rule = await getCommissionRule(db, input.service);
  const charges = computeCharges(input.amount, rule);
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
  const ruleId = rule?._id ? String(rule._id) : null;

  let payment;
  try {
    payment = await recordTransaction(db, {
      ...input,
      type: 'payment',
      status: 'success',
      ruleId,
      ruleSnapshot,
      meta: { ...(input.meta || {}), net: charges.net },
    });
  } catch (error: any) {
    // Another request wrote this payment a moment ago: return theirs, write nothing.
    if (error?.code === 11000) {
      const winner = await db
        .collection('transactions')
        .findOne({ type: 'payment', gatewayPaymentId: input.gatewayPaymentId });
      if (winner) return { payment: winner, charges: null, duplicate: true };
    }
    throw error;
  }

  const derived = { ...input, parentReference: payment.reference, ruleId, ruleSnapshot, status: 'success' as const };
  if (charges.commission > 0) await recordTransaction(db, { ...derived, type: 'commission', amount: charges.commission });
  if (charges.gst > 0) await recordTransaction(db, { ...derived, type: 'gst', amount: charges.gst });
  if (charges.gatewayFee > 0) await recordTransaction(db, { ...derived, type: 'gateway_fee', amount: charges.gatewayFee });

  return { payment, charges, duplicate: false };
}

async function upgradeFailedPayment(
  db: Db,
  failed: Record<string, any>,
  input: Omit<TransactionInput, 'type' | 'status'> & { gatewayPaymentId: string }
) {
  const transactions = db.collection('transactions');
  const rule = await getCommissionRule(db, input.service);
  const charges = computeCharges(input.amount, rule);
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
  const ruleId = rule?._id ? String(rule._id) : null;
  const now = new Date();

  // The status in the filter lets only one caller turn the entry into a payment.
  const won = await transactions.updateOne(
    { _id: failed._id, status: 'failed' },
    {
      $set: {
        ...input,
        amount: roundMoney(Math.abs(input.amount)),
        status: 'success',
        ruleId,
        ruleSnapshot,
        meta: { ...(failed.meta || {}), ...(input.meta || {}), net: charges.net, firstReportedFailedAt: failed.createdAt },
        // Dated when the money was actually received.
        createdAt: now,
        updatedAt: now,
      },
    }
  );
  const payment = await transactions.findOne({ _id: failed._id });
  if (won.modifiedCount !== 1 || !payment) return { payment: payment || failed, charges: null, duplicate: true };

  const derived = { ...input, parentReference: payment.reference, ruleId, ruleSnapshot, status: 'success' as const };
  if (charges.commission > 0) await recordTransaction(db, { ...derived, type: 'commission', amount: charges.commission });
  if (charges.gst > 0) await recordTransaction(db, { ...derived, type: 'gst', amount: charges.gst });
  if (charges.gatewayFee > 0) await recordTransaction(db, { ...derived, type: 'gateway_fee', amount: charges.gatewayFee });
  return { payment, charges, duplicate: false };
}

/**
 * Records a payment attempt the gateway reported as failed: one `payment`
 * entry with status 'failed', which no figure counts. Nothing was received, so
 * no commission, GST or gateway fee is written. Safe to call twice for the
 * same gateway payment; an attempt that is already in the ledger (in any
 * status) is returned untouched.
 */
export async function recordFailedPayment(
  db: Db,
  input: Omit<TransactionInput, 'type' | 'status'> & { gatewayPaymentId: string }
) {
  await ensurePaymentIndex(db);
  const transactions = db.collection('transactions');
  const existing = await transactions.findOne({ type: 'payment', gatewayPaymentId: input.gatewayPaymentId });
  if (existing) return { payment: existing, duplicate: true };
  try {
    const payment = await recordTransaction(db, { ...input, type: 'payment', status: 'failed' });
    return { payment, duplicate: false };
  } catch (error: any) {
    if (error?.code === 11000) {
      const winner = await transactions.findOne({ type: 'payment', gatewayPaymentId: input.gatewayPaymentId });
      if (winner) return { payment: winner, duplicate: true };
    }
    throw error;
  }
}

/** Entries written because of a payment: they follow the payment into and out of a dispute. */
export const DERIVED_TYPES = ['commission', 'gst', 'gateway_fee', 'refund', 'refund_deduction'] as const;

/* ------------------------------------------------------------------ */
/* Coupon discounts                                                    */
/* ------------------------------------------------------------------ */

/**
 * COUPONS ARE FUNDED BY THE PLATFORM.
 *
 * A booking bought with a coupon is recorded like this:
 *   payment      the amount the customer actually paid (what the gateway
 *                received), written by recordPaymentWithCharges as usual;
 *   adjustment   meta.kind 'coupon_discount': the discount, owed to the event's
 *                payee, so the payee still earns on the list price;
 *   commission   and gst "top-up" entries (meta.kind 'coupon_commission') so
 *                that commission and GST are charged on the list price, exactly
 *                as if the customer had paid it. The gateway fee stays on the
 *                amount the gateway really processed.
 * The payee's figures are therefore the same as for a sale at the list price
 * (less the smaller gateway fee), and the cost of the discount is the
 * platform's.
 *
 * A coupon discount entry follows its sale: it stops counting ('refunded')
 * when the payment it belongs to is refunded or charged back, or when a
 * booking made free by the coupon is cancelled, and it is held ('disputed')
 * while the payment is disputed. syncCouponDiscounts() keeps that true; it runs
 * before every payeeBalance().
 */
export const COUPON_DISCOUNT_KIND = 'coupon_discount';
export const COUPON_COMMISSION_KIND = 'coupon_commission';

let couponIndexReady: Promise<unknown> | null = null;
function ensureCouponIndex(db: Db) {
  if (!couponIndexReady) {
    couponIndexReady = db
      .collection('transactions')
      .createIndex(
        { bookingId: 1 },
        {
          unique: true,
          name: 'one_coupon_discount_per_booking',
          partialFilterExpression: { type: 'adjustment', 'meta.kind': COUPON_DISCOUNT_KIND },
        }
      )
      .catch((error) => {
        couponIndexReady = null;
        console.error('Could not create the coupon discount index:', error?.message || error);
      });
  }
  return couponIndexReady;
}

export interface CouponDiscountInput {
  service: Service;
  bookingId: string;
  eventId?: string | null;
  payeeType?: TransactionInput['payeeType'];
  payeeId?: string | null;
  payeeName?: string | null;
  customerPhone?: string | null;
  /** Price before the coupon. */
  listAmount: number;
  /** What the customer paid: listAmount - discount. 0 for a booking the coupon made free. */
  amountPaid: number;
  discount: number;
  /** Reference of the customer's payment entry; null when the coupon made the booking free. */
  paymentReference: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  couponId: string;
  code: string;
  createdBy?: string | null;
}

/**
 * Writes the coupon discount entry and the commission / GST top-ups for one
 * booking. Safe to call any number of times: one discount entry per booking is
 * enforced by a unique index, and the top-ups are written once.
 */
export async function recordCouponDiscount(db: Db, input: CouponDiscountInput) {
  await ensureCouponIndex(db);
  const transactions = db.collection('transactions');
  const discount = roundMoney(Math.max(0, input.discount));
  if (!(discount > 0) || !input.bookingId) return { entry: null, duplicate: false, topUps: [] as any[] };

  const base = {
    service: input.service,
    status: 'success' as const,
    bookingId: input.bookingId,
    eventId: input.eventId || null,
    payeeType: input.payeeType || null,
    payeeId: input.payeeId || null,
    payeeName: input.payeeName || null,
    customerPhone: input.customerPhone || null,
    gatewayOrderId: input.gatewayOrderId || null,
    gatewayPaymentId: input.gatewayPaymentId || null,
    createdBy: input.createdBy || null,
  };

  let entry: any = await transactions.findOne({ type: 'adjustment', 'meta.kind': COUPON_DISCOUNT_KIND, bookingId: input.bookingId });
  let duplicate = Boolean(entry);
  if (!entry) {
    try {
      entry = await recordTransaction(db, {
        ...base,
        type: 'adjustment',
        amount: discount,
        parentReference: input.paymentReference,
        description: `Coupon ${input.code}: discount on booking ${input.bookingId}, funded by the platform and owed to the payee`,
        meta: {
          kind: COUPON_DISCOUNT_KIND,
          direction: 'credit',
          fundedBy: 'platform',
          couponId: input.couponId,
          code: input.code,
          listPrice: roundMoney(input.listAmount),
          amountPaid: roundMoney(input.amountPaid),
          chargesAdjusted: false,
        },
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      entry = await transactions.findOne({ type: 'adjustment', 'meta.kind': COUPON_DISCOUNT_KIND, bookingId: input.bookingId });
      duplicate = true;
    }
  }
  if (!entry) return { entry: null, duplicate, topUps: [] as any[] };

  // Only one caller writes the top-ups.
  const claimed = await transactions.updateOne(
    { _id: entry._id, 'meta.chargesAdjusted': false },
    { $set: { 'meta.chargesAdjusted': 'writing', updatedAt: new Date() } }
  );
  const topUps: any[] = [];
  if (claimed.modifiedCount === 1) {
    const payment = input.paymentReference ? await transactions.findOne({ type: 'payment', reference: input.paymentReference }) : null;
    const rule: CommissionRule | null = payment?.ruleSnapshot
      ? ({ ...payment.ruleSnapshot, service: input.service, status: 'active' } as CommissionRule)
      : payment
      ? null // the payment was recorded with no commission rule: nothing to top up
      : await getCommissionRule(db, input.service);
    const onList = computeCharges(input.listAmount, rule);
    const onPaid = computeCharges(input.amountPaid, rule);
    const extraCommission = roundMoney(onList.commission - onPaid.commission);
    const extraGst = roundMoney(onList.gst - onPaid.gst);
    const derived = {
      ...base,
      parentReference: input.paymentReference || entry.reference,
      ruleId: payment?.ruleId || (rule as any)?._id ? String(payment?.ruleId || (rule as any)?._id) : null,
      ruleSnapshot: payment?.ruleSnapshot || null,
      meta: { kind: COUPON_COMMISSION_KIND, couponDiscountReference: entry.reference, code: input.code },
    };
    if (extraCommission > 0) {
      topUps.push(
        await recordTransaction(db, {
          ...derived,
          type: 'commission',
          amount: extraCommission,
          description: `Commission on the coupon discount (coupon ${input.code}), so commission is charged on the list price`,
        })
      );
    }
    if (extraGst > 0) {
      topUps.push(
        await recordTransaction(db, {
          ...derived,
          type: 'gst',
          amount: extraGst,
          description: `GST on the commission on the coupon discount (coupon ${input.code})`,
        })
      );
    }
    await transactions.updateOne(
      { _id: entry._id },
      { $set: { 'meta.chargesAdjusted': true, 'meta.topUpReferences': topUps.map((t) => t.reference), updatedAt: new Date() } }
    );
  }
  return { entry, duplicate, topUps };
}

/**
 * Brings coupon discount entries (and, for bookings the coupon made free, the
 * charges written with them) in line with their sale. See the comment on
 * COUPON_DISCOUNT_KIND. Returns how many entries changed.
 */
export async function syncCouponDiscounts(db: Db, scope: { payeeType?: string; payeeId?: string } = {}): Promise<number> {
  const transactions = db.collection('transactions');
  const filter: Record<string, any> = { type: 'adjustment', 'meta.kind': COUPON_DISCOUNT_KIND };
  if (scope.payeeType) filter.payeeType = scope.payeeType;
  if (scope.payeeId) filter.payeeId = scope.payeeId;
  const entries = await transactions.find(filter).limit(5000).toArray();
  if (!entries.length) return 0;

  const parentRefs = Array.from(new Set(entries.map((e) => e.parentReference).filter((r) => typeof r === 'string' && r)));
  const parents = parentRefs.length
    ? await transactions.find({ type: 'payment', reference: { $in: parentRefs } }, { projection: { reference: 1, status: 1 } }).toArray()
    : [];
  const parentOf = new Map(parents.map((p) => [String(p.reference), p]));
  const refunded = parentRefs.length
    ? new Set(
        (await transactions.distinct('parentReference', {
          parentReference: { $in: parentRefs },
          type: { $in: ['refund', 'refund_deduction'] },
          status: 'success',
        })) as string[]
      )
    : new Set<string>();

  // Bookings the coupon made free have no payment: they follow the booking.
  const freeIds = entries.filter((e) => !parentOf.has(String(e.parentReference || ''))).map((e) => String(e.bookingId || ''));
  const oids = freeIds.filter((id) => /^[a-f0-9]{24}$/i.test(id)).map((id) => new ObjectId(id));
  const bookings = freeIds.length
    ? await db
        .collection('bookings')
        .find({ $or: [{ _id: { $in: oids } }, { _id: { $in: freeIds as any[] } }] }, { projection: { status: 1 } })
        .toArray()
    : [];
  const bookingStatus = new Map(bookings.map((b) => [String(b._id), String(b.status || '')]));

  let changed = 0;
  const now = new Date();
  for (const e of entries) {
    const parent = parentOf.get(String(e.parentReference || ''));
    let target: TransactionStatus;
    if (parent) {
      if (parent.status === 'disputed') target = 'disputed';
      else if (refunded.has(String(parent.reference))) target = 'refunded';
      else if (parent.status === 'success') target = 'success';
      else target = 'refunded';
    } else {
      const status = bookingStatus.get(String(e.bookingId || ''));
      target = !status || status === 'cancelled' || status === 'expired' ? 'refunded' : 'success';
    }
    if (e.status !== target) {
      await transactions.updateOne({ _id: e._id }, { $set: { status: target, updatedAt: now, 'meta.statusFollows': parent ? 'payment' : 'booking' } });
      changed += 1;
    }
    if (!parent) {
      // The commission and GST written with a free booking's discount follow it.
      const children = await transactions.updateMany(
        { parentReference: e.reference, type: { $in: ['commission', 'gst'] }, status: { $ne: target } },
        { $set: { status: target, updatedAt: now } }
      );
      changed += children.modifiedCount;
    }
  }
  return changed;
}

/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

/**
 * What a payee is owed and has been paid, from ledger entries with status
 * 'success' only:
 *   earned  = payments - commission - gst - gateway fees - refunds - refund deductions
 *   settled = settlements paid
 *   pending = earned - settled
 *
 * Cancellations: when a booking is cancelled and refunded, the payee earns
 * nothing from it and the platform keeps the cancellation charge. The refund
 * and the amount kept under the refund rule (the refund deduction) are both
 * taken from the payee, and the refund processing marks the commission, GST
 * and gateway fee of the original payment 'refunded', so they stop counting.
 * A 1,000 payment refunded 880 with 120 kept therefore nets to zero for the
 * payee, and the platform's income from it is the 120.
 *
 * Disputes: while a payment is disputed, it and every entry derived from it
 * carry status 'disputed', so none of them is in `earned` or `pending` and the
 * amount cannot be settled. `onHold` is what returns to `pending` if the
 * dispute is cleared.
 *
 * Coupons: coupon discounts (adjustment entries with meta.kind
 * 'coupon_discount', see COUPON_DISCOUNT_KIND) are funded by the platform and
 * are earned by the payee:
 *   earned = payments + coupon discounts - commission - gst - gateway fees
 *            - refunds - refund deductions
 * No other adjustment entry is counted here, as before.
 */
export async function payeeBalance(db: Db, payeeType: string, payeeId: string) {
  await syncCouponDiscounts(db, { payeeType, payeeId });
  const [rows, couponRows] = await Promise.all([
    db
      .collection('transactions')
      .aggregate([
        { $match: { payeeType, payeeId, status: { $in: ['success', 'disputed'] } } },
        { $group: { _id: { type: '$type', status: '$status' }, total: { $sum: '$amount' } } },
      ])
      .toArray(),
    db
      .collection('transactions')
      .aggregate([
        { $match: { payeeType, payeeId, type: 'adjustment', 'meta.kind': COUPON_DISCOUNT_KIND, status: { $in: ['success', 'disputed'] } } },
        { $group: { _id: '$status', total: { $sum: '$amount' } } },
      ])
      .toArray(),
  ]);
  const couponOf = (status: string) => Number(couponRows.find((r) => r._id === status)?.total || 0);

  const sums = (status: string) =>
    Object.fromEntries(rows.filter((r) => r._id.status === status).map((r) => [String(r._id.type), r.total as number]));
  const net = (by: Record<string, number>) =>
    (by.payment || 0) -
    (by.commission || 0) -
    (by.gst || 0) -
    (by.gateway_fee || 0) -
    (by.refund || 0) -
    (by.refund_deduction || 0);
  const by = sums('success');
  const held = sums('disputed');
  const couponDiscounts = couponOf('success');
  const earned = net(by) + couponDiscounts;
  const settled = by.settlement || 0;

  return {
    gross: roundMoney(by.payment || 0),
    /** Coupon discounts funded by the platform and owed to this payee (already included in `earned`). */
    couponDiscounts: roundMoney(couponDiscounts),
    commission: roundMoney(by.commission || 0),
    gst: roundMoney(by.gst || 0),
    gatewayFee: roundMoney(by.gateway_fee || 0),
    refunds: roundMoney(by.refund || 0),
    refundDeductions: roundMoney(by.refund_deduction || 0),
    earned: roundMoney(earned),
    settled: roundMoney(settled),
    pending: roundMoney(earned - settled),
    /** Gross value of payments under dispute, and what is held back from settlement because of them. */
    disputed: roundMoney(held.payment || 0),
    onHold: roundMoney(Math.max(0, net(held) + couponOf('disputed'))),
  };
}
