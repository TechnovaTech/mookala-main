/**
 * Server-side rules for the marketing resources, plus the coupon engine
 * (evaluateCoupon / redeemCoupon) used by POST /api/public/coupons/validate
 * and, later, by the booking flow. Server only.
 */
import type { Db } from 'mongodb';
import { registerHooks } from '../resource-hooks';
import { SERVICES } from '../ledger';

/* ------------------------------------------------------------------ */
/* Coupons                                                             */
/* ------------------------------------------------------------------ */

const COUPON_CODE = /^[A-Z0-9_-]{3,30}$/;
const COUPON_SERVICES = ['all', ...SERVICES.map((s) => s.value as string)];

export function normaliseCouponCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function couponProblem(coupon: Record<string, any>): string | null {
  if (!COUPON_CODE.test(coupon.code || '')) {
    return 'Coupon code must be 3 to 30 characters: letters, numbers, hyphens and underscores only';
  }
  if (!COUPON_SERVICES.includes(coupon.service)) return 'Applies to has an unknown service';
  const value = Number(coupon.value);
  if (!(value > 0)) return 'Value must be more than zero';
  if (coupon.discountType === 'percent' && value > 100) return 'A percentage discount cannot be more than 100';
  if (coupon.validFrom && coupon.validUntil && new Date(coupon.validUntil) <= new Date(coupon.validFrom)) {
    return 'Valid until must be after valid from';
  }
  for (const key of ['usageLimit', 'perUserLimit']) {
    if (coupon[key] !== null && coupon[key] !== undefined && !Number.isInteger(coupon[key])) {
      return 'Usage limits must be whole numbers';
    }
  }
  return null;
}

registerHooks('coupons', {
  async beforeCreate({ db, doc }) {
    doc.code = normaliseCouponCode(doc.code);
    const problem = couponProblem(doc);
    if (problem) return problem;
    if (await db.collection('coupons').findOne({ code: doc.code }, { projection: { _id: 1 } })) {
      return `A coupon with the code ${doc.code} already exists`;
    }
    // The index is the real guarantee if two admins save the same code at once.
    await db.collection('coupons').createIndex({ code: 1 }, { unique: true }).catch(() => undefined);
    doc.timesUsed = 0;
  },

  async beforeUpdate({ db, existing, changes }) {
    if ('code' in changes) changes.code = normaliseCouponCode(changes.code);
    const merged = { ...existing, ...changes };
    const problem = couponProblem(merged);
    if (problem) return problem;
    if (merged.code !== existing.code) {
      if ((existing.timesUsed || 0) > 0) return 'This coupon has already been used: its code cannot be changed';
      const clash = await db.collection('coupons').findOne({ code: merged.code, _id: { $ne: existing._id } }, { projection: { _id: 1 } });
      if (clash) return `A coupon with the code ${merged.code} already exists`;
    }
  },

  beforeStatusChange({ existing, to }) {
    if (to === 'active' && existing.validUntil && new Date(existing.validUntil) <= new Date()) {
      return 'This coupon\'s validity has ended. Change "Valid until" before activating it.';
    }
  },
});

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

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Checks whether a coupon applies to an order and works out the discount.
 * Reads only: nothing is redeemed.
 */
export async function evaluateCoupon(db: Db, request: CouponRequest, now = new Date()): Promise<CouponEvaluation> {
  const code = normaliseCouponCode(request.code);
  const amount = typeof request.amount === 'number' ? request.amount : parseFloat(String(request.amount ?? ''));
  const service = typeof request.service === 'string' ? request.service : '';
  const userPhone = typeof request.userPhone === 'string' ? request.userPhone.trim().slice(0, 20) : '';

  const refuse = (reason: string, coupon: any = null): CouponEvaluation => ({
    valid: false,
    reason,
    code,
    discount: 0,
    payable: Number.isFinite(amount) && amount > 0 ? round2(amount) : 0,
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

  if (coupon.validFrom && new Date(coupon.validFrom) > now) return refuse('This coupon is not valid yet', coupon);
  if (coupon.validUntil && new Date(coupon.validUntil) <= now) return refuse('This coupon has expired', coupon);
  if (coupon.service !== 'all' && coupon.service !== service) return refuse('This coupon does not apply to this service', coupon);
  if (coupon.minOrderAmount && amount < coupon.minOrderAmount) {
    return refuse(`This coupon needs a minimum order of ₹${coupon.minOrderAmount}`, coupon);
  }
  if (coupon.usageLimit && (coupon.timesUsed || 0) >= coupon.usageLimit) {
    return refuse('This coupon has been fully used', coupon);
  }
  if (coupon.perUserLimit) {
    if (!userPhone) return refuse('Sign in to use this coupon', coupon);
    const used = await db.collection('couponRedemptions').countDocuments({ couponId: String(coupon._id), userPhone });
    if (used >= coupon.perUserLimit) return refuse('You have already used this coupon', coupon);
  }

  let discount = coupon.discountType === 'percent' ? (amount * Number(coupon.value)) / 100 : Number(coupon.value);
  if (coupon.discountType === 'percent' && coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = round2(Math.min(discount, amount));

  return { valid: true, reason: null, code, discount, payable: round2(amount - discount), coupon };
}

/**
 * Redeems a coupon for a booking. For the booking flow to call once payment
 * for the discounted amount is confirmed; NOTHING CALLS THIS YET.
 *
 * Safe to call twice for the same booking: the first redemption is returned.
 * The total usage limit is enforced atomically. The per-customer limit is
 * checked just before, so two simultaneous bookings by one customer could
 * both pass it.
 */
export async function redeemCoupon(
  db: Db,
  request: CouponRequest & { bookingId: string }
): Promise<{ ok: boolean; error: string | null; discount: number; payable: number; redemptionId: string | null }> {
  const bookingId = typeof request.bookingId === 'string' ? request.bookingId.trim().slice(0, 64) : '';
  if (!bookingId) return { ok: false, error: 'A booking is required to redeem a coupon', discount: 0, payable: 0, redemptionId: null };

  const code = normaliseCouponCode(request.code);
  const redemptions = db.collection('couponRedemptions');
  const already = await redemptions.findOne({ code, bookingId });
  if (already) {
    return { ok: true, error: null, discount: already.discount, payable: already.payable, redemptionId: String(already._id) };
  }

  const result = await evaluateCoupon(db, request);
  if (!result.valid || !result.coupon) {
    return { ok: false, error: result.reason, discount: 0, payable: result.payable, redemptionId: null };
  }

  const coupon = result.coupon;
  const filter: Record<string, any> = { _id: coupon._id, status: 'active' };
  if (coupon.usageLimit) {
    filter.$or = [{ timesUsed: { $lt: coupon.usageLimit } }, { timesUsed: null }];
  }
  const claimed = await db.collection('coupons').updateOne(filter, { $inc: { timesUsed: 1 } });
  if (claimed.modifiedCount !== 1) {
    return { ok: false, error: 'This coupon has been fully used', discount: 0, payable: result.payable, redemptionId: null };
  }

  const inserted = await redemptions.insertOne({
    couponId: String(coupon._id),
    code,
    bookingId,
    userPhone: typeof request.userPhone === 'string' ? request.userPhone.trim().slice(0, 20) : null,
    service: request.service,
    orderAmount: result.payable + result.discount,
    discount: result.discount,
    payable: result.payable,
    createdAt: new Date(),
  });

  return { ok: true, error: null, discount: result.discount, payable: result.payable, redemptionId: String(inserted.insertedId) };
}

/* ------------------------------------------------------------------ */
/* Referral programmes and promotions                                  */
/* ------------------------------------------------------------------ */

function endBeforeStart(record: Record<string, any>, startKey: string, endKey: string): boolean {
  return Boolean(record[startKey] && record[endKey] && new Date(record[endKey]) <= new Date(record[startKey]));
}

registerHooks('referral-programmes', {
  beforeCreate({ doc }) {
    if (endBeforeStart(doc, 'startDate', 'endDate')) return 'End date must be after the start date';
  },
  beforeUpdate({ existing, changes }) {
    if (endBeforeStart({ ...existing, ...changes }, 'startDate', 'endDate')) return 'End date must be after the start date';
  },
});

registerHooks('promotions', {
  beforeCreate({ doc }) {
    if (endBeforeStart(doc, 'startsAt', 'endsAt')) return 'Ends at must be after starts at';
  },
  beforeUpdate({ existing, changes }) {
    if (endBeforeStart({ ...existing, ...changes }, 'startsAt', 'endsAt')) return 'Ends at must be after starts at';
  },
  beforeStatusChange({ existing, to }) {
    if (to === 'live' && existing.endsAt && new Date(existing.endsAt) <= new Date()) {
      return 'This promotion has already ended. Change its dates before making it live.';
    }
  },
});

/* ------------------------------------------------------------------ */
/* Push campaigns                                                      */
/* ------------------------------------------------------------------ */

/** Once approved, the content that was approved cannot change without going back to draft. */
const CONTENT_LOCKED = ['approved', 'scheduled', 'sending', 'sent', 'failed'];
const CONTENT_FIELDS = ['title', 'message', 'deepLink', 'audience', 'audienceValue'];

const PUSH_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['scheduled', 'draft', 'cancelled'],
  scheduled: ['draft', 'cancelled'],
  failed: ['draft', 'cancelled'],
  sending: ['cancelled'],
  cancelled: ['draft'],
  sent: [],
};

function same(a: any, b: any): boolean {
  const norm = (v: any) => (v === undefined || v === '' ? null : v instanceof Date ? v.getTime() : v);
  const left = norm(a);
  const right = norm(b);
  if (left instanceof Object || right instanceof Object) return JSON.stringify(left) === JSON.stringify(right);
  return left === right;
}

function audienceProblem(record: Record<string, any>): string | null {
  if ((record.audience === 'city' || record.audience === 'followers_of_artist') && !String(record.audienceValue || '').trim()) {
    return record.audience === 'city'
      ? 'Enter the city in "Audience value"'
      : 'Enter the artist\'s ID or phone number in "Audience value"';
  }
  return null;
}

registerHooks('push-campaigns', {
  beforeCreate({ doc }) {
    return audienceProblem(doc) || undefined;
  },

  beforeUpdate({ existing, changes }) {
    if (existing.status === 'sent' || existing.status === 'sending') return 'A campaign that has been sent cannot be edited';
    if (CONTENT_LOCKED.includes(existing.status)) {
      const touched = CONTENT_FIELDS.filter((key) => key in changes && !same(existing[key], changes[key]));
      if (touched.length) {
        return 'The content and audience of this campaign were approved and cannot be changed. Move it back to Draft to edit it; it will then need approval again.';
      }
    }
    return audienceProblem({ ...existing, ...changes }) || undefined;
  },

  beforeStatusChange({ existing, from, to, admin }) {
    if (to === 'sending' || to === 'sent' || to === 'failed') {
      return 'This status is set by the send action, not by hand. Use "Send now" on the campaign.';
    }
    if (!(PUSH_TRANSITIONS[from] || []).includes(to)) {
      if (to === 'scheduled') return 'Only an approved campaign can be scheduled. Submit it for approval first.';
      if (to === 'approved') return 'Only a campaign that is pending approval can be approved.';
      return `A campaign cannot move from "${from}" to "${to}".`;
    }
    if (to === 'pending_approval') return audienceProblem(existing) || undefined;
    if (to === 'approved') return { approvedBy: admin.email || null, approvedAt: new Date() };
    if (to === 'scheduled') {
      if (!existing.approvedBy) return 'Only an approved campaign can be scheduled.';
      if (!existing.scheduledFor) return 'Set "Scheduled for" before scheduling the campaign.';
      if (new Date(existing.scheduledFor) <= new Date()) return '"Scheduled for" is in the past. Choose a later time.';
    }
    if (to === 'draft') return { approvedBy: null, approvedAt: null };
  },
});
