import { ObjectId, type Db } from 'mongodb';
import { normalisePhone } from './otp';
import { SERVICES, recordCouponDiscount, roundMoney, type Service } from './ledger';

/**
 * Coupons at checkout. Server only.
 *
 * FUNDING: coupons are funded by the platform. The customer pays the
 * discounted price; the payee (organiser or artist) still earns on the list
 * price. The ledger records the payment at the amount received and the
 * discount as a separate entry owed to the payee (lib/ledger.ts,
 * COUPON_DISCOUNT_KIND).
 *
 * THE FLOW
 *   1. evaluateCoupon()       checks a code against an order. Reads only.
 *   2. holdCouponForBooking() at order time, after the seats are held. It takes
 *                             one "slot" of the total usage limit and one of the
 *                             customer's own limit in `couponSlots`, whose
 *                             unique index { couponId, scope, slot } makes both
 *                             limits atomic: two simultaneous orders cannot both
 *                             take the last use, and one customer cannot use a
 *                             coupon twice at once. A hold is NOT a redemption:
 *                             it lapses with the order's seat hold, so an
 *                             abandoned or failed order gives nothing back
 *                             because nothing was used.
 *   3. settleBookingCoupon()  once the payment is confirmed (verify, webhook)
 *                             or the free booking is placed: marks the slots
 *                             redeemed, records the redemption, counts it in
 *                             "Times used" and writes the ledger entries. Safe
 *                             to run any number of times.
 *
 * A gateway's smallest charge is ₹1, so a coupon either makes a booking free
 * or leaves at least ₹1 to pay.
 */

export const COUPON_CODE = /^[A-Z0-9_-]{3,30}$/;
export const REDEMPTIONS = 'couponRedemptions';
export const SLOTS = 'couponSlots';
const MIN_CHARGE = 1;
/** A hold made before the booking exists lasts this long unless it is bound to the booking. */
const PRE_HOLD_MS = 2 * 60 * 1000;

export function normaliseCouponCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export interface CouponRequest {
  code: unknown;
  service: unknown;
  amount: unknown;
  userPhone?: unknown;
}

export interface CouponEvaluation {
  valid: boolean;
  /** Why the coupon does not apply. Safe to show to a customer. */
  reason: string | null;
  code: string;
  discount: number;
  payable: number;
  coupon: any | null;
}

let indexes: Promise<unknown> | null = null;
export function ensureCouponIndexes(db: Db) {
  if (!indexes) {
    indexes = Promise.all([
      db.collection(SLOTS).createIndex({ couponId: 1, scope: 1, slot: 1 }, { unique: true }),
      db.collection(SLOTS).createIndex({ bookingId: 1 }),
      db.collection(SLOTS).createIndex({ couponId: 1, scope: 1, state: 1 }),
      db.collection(REDEMPTIONS).createIndex({ bookingId: 1 }, { unique: true }),
      db.collection(REDEMPTIONS).createIndex({ couponId: 1, userPhone: 1 }),
      db.collection('bookings').createIndex({ 'coupon.couponId': 1, 'coupon.redeemedAt': 1 }, { sparse: true }),
    ]).catch((error) => {
      indexes = null;
      console.error('Could not create the coupon indexes:', error?.message || error);
    });
  }
  return indexes;
}

function phoneKey(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().slice(0, 20) : '';
  return normalisePhone(raw) || raw;
}

/** Uses that still count against a customer's limit: redeemed, or held by an order that can still be paid. */
async function usesByCustomer(db: Db, couponId: string, phone: string, now: Date, exceptBookingId?: string): Promise<number> {
  await freeStaleHolds(db, couponId, `user:${phone}`, now);
  const slots = await db
    .collection(SLOTS)
    .find({ couponId, scope: `user:${phone}`, state: { $in: ['held', 'redeemed'] } }, { projection: { state: 1, expiresAt: 1, bookingId: 1 } })
    .toArray();
  const live = slots.filter(
    (s) => s.bookingId !== exceptBookingId && (s.state === 'redeemed' || (s.expiresAt && new Date(s.expiresAt) > now))
  ).length;
  // Redemptions recorded before slots existed.
  const legacy = await db.collection(REDEMPTIONS).countDocuments({ couponId, userPhone: phone, slotted: { $ne: true } });
  return live + legacy;
}

/**
 * Checks whether a coupon applies to an order and works out the discount.
 * Reads only: nothing is held or redeemed.
 */
export async function evaluateCoupon(db: Db, request: CouponRequest, now = new Date()): Promise<CouponEvaluation> {
  const code = normaliseCouponCode(request.code);
  const amount = typeof request.amount === 'number' ? request.amount : parseFloat(String(request.amount ?? ''));
  const service = typeof request.service === 'string' ? request.service : '';
  const userPhone = phoneKey(request.userPhone);

  const refuse = (reason: string, coupon: any = null): CouponEvaluation => ({
    valid: false,
    reason,
    code,
    discount: 0,
    payable: Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0,
    coupon,
  });

  if (!COUPON_CODE.test(code)) return refuse('This coupon code is not valid');
  if (!Number.isFinite(amount) || amount <= 0) return refuse('The order amount is missing');
  if (!SERVICES.some((s) => s.value === service)) return refuse('The service is missing or unknown');

  const coupon = await db.collection('coupons').findOne({ code });
  // Drafts and paused coupons look the same as codes that do not exist.
  if (!coupon || coupon.status === 'draft' || coupon.status === 'paused') return refuse('This coupon code is not valid');
  if (coupon.status === 'expired') return refuse('This coupon has expired', coupon);
  if (coupon.status !== 'active') return refuse('This coupon code is not valid');
  // A reward coupon issued to one customer (referrals) looks like an unknown code to anyone else.
  if (coupon.restrictedToPhone && coupon.restrictedToPhone !== userPhone) {
    return refuse(userPhone ? 'This coupon code is not valid' : 'Sign in to use this coupon');
  }

  if (coupon.validFrom && new Date(coupon.validFrom) > now) return refuse('This coupon is not valid yet', coupon);
  if (coupon.validUntil && new Date(coupon.validUntil) <= now) return refuse('This coupon has expired', coupon);
  if (coupon.service !== 'all' && coupon.service !== service) return refuse('This coupon does not apply to this service', coupon);
  if (coupon.minOrderAmount && amount < coupon.minOrderAmount) {
    return refuse(`This coupon needs a minimum order of ₹${coupon.minOrderAmount}`, coupon);
  }
  if (coupon.usageLimit) {
    const taken = await db.collection(SLOTS).countDocuments({
      couponId: String(coupon._id),
      scope: 'all',
      $or: [{ state: 'redeemed' }, { state: 'held', expiresAt: { $gt: now } }],
    });
    if (Math.max(taken, coupon.timesUsed || 0) >= coupon.usageLimit) return refuse('This coupon has been fully used', coupon);
  }
  if (coupon.perUserLimit) {
    if (!userPhone) return refuse('Sign in to use this coupon', coupon);
    const used = await usesByCustomer(db, String(coupon._id), userPhone, now);
    if (used >= coupon.perUserLimit) return refuse('You have already used this coupon', coupon);
  }

  let discount = coupon.discountType === 'percent' ? (amount * Number(coupon.value)) / 100 : Number(coupon.value);
  if (coupon.discountType === 'percent' && coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = roundMoney(Math.min(discount, amount));
  let payable = roundMoney(amount - discount);
  // The gateway cannot take less than ₹1: anything between is rounded up to ₹1.
  if (payable > 0 && payable < MIN_CHARGE) {
    payable = MIN_CHARGE;
    discount = roundMoney(amount - MIN_CHARGE);
  }
  if (!(discount > 0)) return refuse('This coupon gives no discount on this order', coupon);

  return { valid: true, reason: null, code, discount, payable, coupon };
}

/* ------------------------------------------------------------------ */
/* Holds                                                               */
/* ------------------------------------------------------------------ */

async function bookingState(db: Db, bookingId: string): Promise<any | null> {
  if (!bookingId || bookingId.startsWith('pending:')) return null;
  const filter = /^[a-f0-9]{24}$/i.test(bookingId) ? { $or: [{ _id: new ObjectId(bookingId) }, { _id: bookingId as any }] } : { _id: bookingId as any };
  return db.collection('bookings').findOne(filter, { projection: { status: 1, paymentStatus: 1, expiresAt: 1 } });
}

/**
 * Frees holds whose order can no longer be paid (expired, cancelled, or its
 * seat hold is over). A hold on a paid booking is kept: it becomes redeemed
 * when the booking is settled. A customer's own holds are all checked; for the
 * total limit only holds past their expiry are, to keep this cheap.
 */
async function freeStaleHolds(db: Db, couponId: string, scope: string, now: Date) {
  const filter: Record<string, any> = { couponId, scope, state: 'held' };
  if (!scope.startsWith('user:')) filter.expiresAt = { $lte: now };
  const held = await db.collection(SLOTS).find(filter).limit(200).toArray();
  for (const slot of held) {
    const expired = !slot.expiresAt || new Date(slot.expiresAt) <= now;
    const booking = await bookingState(db, String(slot.bookingId || ''));
    let free = false;
    if (!booking) free = expired; // a placeholder still being turned into a booking, or a booking that was never saved
    else if (booking.status === 'confirmed' || booking.status === 'attended') free = false;
    else if (booking.status === 'pending_payment' && booking.expiresAt && new Date(booking.expiresAt) > now) {
      if (expired) {
        // The order was given more time (an authorised payment waiting for capture).
        await db.collection(SLOTS).updateOne({ _id: slot._id, state: 'held' }, { $set: { expiresAt: new Date(booking.expiresAt) } });
      }
      free = false;
    } else free = true;
    if (free) {
      await db
        .collection(SLOTS)
        .updateMany({ bookingId: slot.bookingId, state: 'held' }, { $set: { state: 'free', freedAt: now, freedBookingId: slot.bookingId } });
    }
  }
}

/**
 * Before a customer starts a new order for an event, the coupon holds of their
 * own unfinished orders for that event are given back: placing the new order
 * replaces those orders (see supersedeOwnHolds in lib/bookings.ts).
 */
export async function releaseOwnPendingHolds(db: Db, userPhone: string, eventId: string) {
  const open = await db
    .collection('bookings')
    .find(
      { userPhone, eventId, status: 'pending_payment', source: 'order', pendingGatewayPaymentId: { $exists: false }, 'coupon.couponId': { $exists: true } },
      { projection: { _id: 1 } }
    )
    .toArray();
  for (const booking of open) await releaseCouponHold(db, String(booking._id));
}

/** Takes one slot of `scope` (limit `limit`) for a booking, or returns null when none is left. */
async function takeSlot(
  db: Db,
  input: { couponId: string; scope: string; limit: number; bookingId: string; userPhone: string; expiresAt: Date; state?: 'held' | 'redeemed' },
  now: Date
): Promise<any | null> {
  const slots = db.collection(SLOTS);
  await freeStaleHolds(db, input.couponId, input.scope, now);
  const fields = {
    state: input.state || 'held',
    bookingId: input.bookingId,
    userPhone: input.userPhone,
    heldAt: now,
    expiresAt: input.expiresAt,
    ...(input.state === 'redeemed' ? { redeemedAt: now } : {}),
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reused = await slots.findOneAndUpdate(
      { couponId: input.couponId, scope: input.scope, state: 'free', slot: { $lte: input.limit } },
      { $set: fields },
      { returnDocument: 'after', sort: { slot: 1 } }
    );
    if (reused) return reused;
    const used = await slots.countDocuments({ couponId: input.couponId, scope: input.scope });
    const legacy =
      input.scope === 'all'
        ? await db.collection(REDEMPTIONS).countDocuments({ couponId: input.couponId, slotted: { $ne: true } })
        : await db.collection(REDEMPTIONS).countDocuments({ couponId: input.couponId, userPhone: input.userPhone, slotted: { $ne: true } });
    if (used + legacy >= input.limit) return null;
    const doc = { couponId: input.couponId, scope: input.scope, slot: used + 1, ...fields, createdAt: now };
    try {
      await slots.insertOne(doc);
      return doc;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      // Someone took that slot number a moment ago: count again.
    }
  }
  return null;
}

export interface HoldResult {
  ok: boolean;
  error: string | null;
}

/**
 * Holds the coupon for an order. `bookingId` may be a placeholder made before
 * the booking exists ("pending:<random>"); bindCouponHold() then moves the
 * hold to the booking.
 */
export async function holdCouponForBooking(
  db: Db,
  input: { coupon: any; userPhone: string; bookingId: string; expiresAt: Date | null }
): Promise<HoldResult> {
  await ensureCouponIndexes(db);
  const now = new Date();
  const couponId = String(input.coupon._id);
  const phone = phoneKey(input.userPhone);
  const expiresAt = input.expiresAt || new Date(now.getTime() + PRE_HOLD_MS);
  const taken: any[] = [];

  const undo = async () => {
    for (const slot of taken) {
      await db.collection(SLOTS).updateOne({ couponId, scope: slot.scope, slot: slot.slot, bookingId: input.bookingId }, { $set: { state: 'free', freedAt: new Date() } });
    }
  };

  if (input.coupon.perUserLimit) {
    if (!phone) return { ok: false, error: 'Sign in to use this coupon' };
    const slot = await takeSlot(db, { couponId, scope: `user:${phone}`, limit: input.coupon.perUserLimit, bookingId: input.bookingId, userPhone: phone, expiresAt }, now);
    if (!slot) return { ok: false, error: 'You have already used this coupon, or it is on another booking of yours that is awaiting payment' };
    taken.push(slot);
  }
  if (input.coupon.usageLimit) {
    const slot = await takeSlot(db, { couponId, scope: 'all', limit: input.coupon.usageLimit, bookingId: input.bookingId, userPhone: phone, expiresAt }, now);
    if (!slot) {
      await undo();
      return { ok: false, error: 'This coupon has been fully used' };
    }
    taken.push(slot);
  }
  return { ok: true, error: null };
}

/** Moves holds made with a placeholder id to the real booking and its hold expiry. */
export async function bindCouponHold(db: Db, placeholder: string, bookingId: string, expiresAt: Date | null) {
  await db
    .collection(SLOTS)
    .updateMany(
      { bookingId: placeholder, state: 'held' },
      { $set: { bookingId, expiresAt: expiresAt || new Date(Date.now() + 365 * 24 * 3600 * 1000) } }
    );
}

/** Gives back a hold at once when the order did not go ahead (seats taken, gateway down). */
export async function releaseCouponHold(db: Db, bookingId: string) {
  await db.collection(SLOTS).updateMany({ bookingId, state: 'held' }, { $set: { state: 'free', freedAt: new Date(), freedBookingId: bookingId } });
}

/* ------------------------------------------------------------------ */
/* Redemption                                                          */
/* ------------------------------------------------------------------ */

async function payeeNameOf(db: Db, booking: any): Promise<string | null> {
  const id = String(booking.payeeId || '');
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const doc = await db
    .collection(booking.payeeType === 'artist' ? 'artists' : 'organizers')
    .findOne({ _id: new ObjectId(id) }, { projection: { name: 1 } });
  return typeof doc?.name === 'string' ? doc.name : null;
}

export interface SettleResult {
  settled: boolean;
  /** Why nothing (more) was done. */
  note: string;
  redemptionId?: string | null;
  ledgerReference?: string | null;
  overLimit?: boolean;
}

/** A booking counts as paid for when it is a ticket and the gateway confirmed the money (or nothing was owed). */
function isPaidTicket(booking: any): boolean {
  if (!booking) return false;
  if (booking.status !== 'confirmed' && booking.status !== 'attended') return false;
  if (booking.paymentStatus !== 'paid') return false;
  return Boolean(booking.gatewayPaymentId) || Number(booking.totalPrice) === 0;
}

/**
 * Redeems the coupon on a booking whose payment is confirmed, or on a free
 * booking that was placed. Idempotent: the redemption has a unique index on
 * the booking, the ledger entry has one too, and the booking is only marked
 * settled when both exist.
 */
export async function settleBookingCoupon(db: Db, bookingInput: any, via = 'confirmation'): Promise<SettleResult> {
  if (!bookingInput?._id) return { settled: false, note: 'No booking' };
  const booking = await db.collection('bookings').findOne({ _id: bookingInput._id });
  const coupon = booking?.coupon;
  if (!booking || !coupon?.couponId) return { settled: false, note: 'No coupon on this booking' };
  if (coupon.redeemedAt && coupon.ledgerReference) return { settled: false, note: 'Already redeemed', redemptionId: coupon.redemptionId };
  if (!isPaidTicket(booking)) return { settled: false, note: 'The payment is not confirmed' };
  const free = Number(booking.totalPrice) === 0;
  if (!free && !booking.ledgerReference) return { settled: false, note: 'The payment is not in the ledger yet' };

  await ensureCouponIndexes(db);
  const now = new Date();
  const bookingId = String(booking._id);
  const couponDoc = await db.collection('coupons').findOne({ _id: new ObjectId(String(coupon.couponId)) });
  const phone = phoneKey(booking.userPhone);
  const listPrice = roundMoney(Number(booking.listPrice ?? coupon.listPrice ?? 0));
  const discount = roundMoney(Number(coupon.discount) || 0);
  const amountPaid = roundMoney(Number(booking.amountPaid ?? booking.totalPrice) || 0);

  // 1. The slots this booking held become redeemed. A payment that arrived
  //    after its hold lapsed takes a free slot now if one is left.
  await db.collection(SLOTS).updateMany({ bookingId, state: 'held' }, { $set: { state: 'redeemed', redeemedAt: now } });
  let overLimit = false;
  if (couponDoc) {
    const needs: { scope: string; limit: number }[] = [];
    if (couponDoc.perUserLimit && phone) needs.push({ scope: `user:${phone}`, limit: couponDoc.perUserLimit });
    if (couponDoc.usageLimit) needs.push({ scope: 'all', limit: couponDoc.usageLimit });
    for (const need of needs) {
      const has = await db.collection(SLOTS).findOne({ bookingId, scope: need.scope, state: 'redeemed' });
      if (has) continue;
      const slot = await takeSlot(
        db,
        { couponId: String(couponDoc._id), scope: need.scope, limit: need.limit, bookingId, userPhone: phone, expiresAt: now, state: 'redeemed' },
        now
      );
      // The customer was charged the discounted price: it is honoured, and flagged.
      if (!slot) overLimit = true;
    }
  }

  // 2. The redemption record, once per booking. "Times used" counts it.
  let redemption = await db.collection(REDEMPTIONS).findOne({ bookingId });
  if (!redemption) {
    const doc = {
      couponId: String(coupon.couponId),
      code: coupon.code,
      bookingId,
      userPhone: phone || null,
      service: 'ticketing',
      eventId: booking.eventId ? String(booking.eventId) : null,
      eventTitle: booking.eventTitle || '',
      listPrice,
      discount,
      amountPaid,
      payeeType: booking.payeeType || null,
      payeeId: booking.payeeId || null,
      paymentReference: booking.ledgerReference || null,
      gatewayPaymentId: booking.gatewayPaymentId || null,
      free,
      overLimit,
      fundedBy: 'platform',
      confirmedVia: via,
      slotted: true,
      createdAt: now,
    };
    try {
      const inserted = await db.collection(REDEMPTIONS).insertOne(doc);
      redemption = { ...doc, _id: inserted.insertedId };
      await db.collection('coupons').updateOne({ _id: new ObjectId(String(coupon.couponId)) }, { $inc: { timesUsed: 1 }, $set: { lastUsedAt: now } });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      redemption = await db.collection(REDEMPTIONS).findOne({ bookingId });
    }
  }

  // 3. The ledger: the discount is owed to the payee and paid for by the platform.
  const ledger = await recordCouponDiscount(db, {
    service: 'ticketing' as Service,
    bookingId,
    eventId: booking.eventId ? String(booking.eventId) : null,
    payeeType: booking.payeeType || null,
    payeeId: booking.payeeId || null,
    payeeName: await payeeNameOf(db, booking),
    customerPhone: booking.userPhone || null,
    listAmount: listPrice,
    amountPaid: free ? 0 : amountPaid,
    discount,
    paymentReference: free ? null : booking.ledgerReference,
    gatewayOrderId: booking.gatewayOrderId || null,
    gatewayPaymentId: booking.gatewayPaymentId || null,
    couponId: String(coupon.couponId),
    code: coupon.code,
  });
  const ledgerReference = ledger.entry?.reference || null;

  await db.collection('bookings').updateOne(
    { _id: booking._id },
    {
      $set: {
        'coupon.redeemedAt': now,
        'coupon.redemptionId': redemption ? String(redemption._id) : null,
        'coupon.ledgerReference': ledgerReference,
        ...(overLimit ? { 'coupon.overLimit': true } : {}),
      },
    }
  );
  if (redemption && ledgerReference && !redemption.ledgerReference) {
    await db.collection(REDEMPTIONS).updateOne({ _id: redemption._id }, { $set: { ledgerReference, paymentReference: booking.ledgerReference || null } });
  }
  return { settled: true, note: 'Redeemed', redemptionId: redemption ? String(redemption._id) : null, ledgerReference, overLimit };
}

/**
 * Settles every confirmed coupon booking that has not been settled yet, for
 * bookings confirmed by a path that does not call settleBookingCoupon itself.
 */
export async function settlePendingCouponBookings(db: Db, scope: { userPhone?: string; couponId?: string } = {}, limit = 100) {
  const filter: Record<string, any> = {
    'coupon.couponId': { $exists: true },
    $or: [{ 'coupon.redeemedAt': { $exists: false } }, { 'coupon.ledgerReference': null }],
    status: { $in: ['confirmed', 'attended'] },
    paymentStatus: 'paid',
  };
  if (scope.userPhone) filter.userPhone = scope.userPhone;
  if (scope.couponId) filter['coupon.couponId'] = scope.couponId;
  const pending = await db.collection('bookings').find(filter).limit(limit).toArray();
  let settled = 0;
  for (const booking of pending) {
    try {
      const result = await settleBookingCoupon(db, booking, 'catch-up');
      if (result.settled) settled += 1;
    } catch (error) {
      console.error('Could not settle the coupon on booking', String(booking._id), error);
    }
  }
  return settled;
}
