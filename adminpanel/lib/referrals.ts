import crypto from 'crypto';
import { ObjectId, type Db } from 'mongodb';
import { normalisePhone } from './otp';

/**
 * Referral programmes (requirements section 13). Server only.
 *
 *   code       every customer gets one referral code, made on first request
 *              (GET /api/public/referrals/code).
 *   claim      a new customer (account made in the last 7 days, no bookings)
 *              enters someone else's code once (POST /api/public/referrals/claim).
 *              A referral is recorded under the programme that is active then:
 *              status 'signed_up', reward 'pending'.
 *   qualify    when the referred customer's first paid booking is confirmed the
 *              referral becomes 'qualified' and the reward is issued as coupons
 *              (collection `coupons`, one use, only for that customer's phone):
 *              one to the referrer and, when the programme gives the new
 *              customer a reward, one to them.
 *
 * Nothing here pays cash: every reward is a discount coupon on ticket bookings,
 * funded by the platform like every coupon.
 */

export const CODES = 'referralCodes';
export const REFERRALS = 'referrals';
export const PROGRAMMES = 'referralProgrammes';
export const CLAIM_WINDOW_DAYS = 7;
export const REWARD_COUPON_DAYS = 90;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let indexes: Promise<unknown> | null = null;
function ensureIndexes(db: Db) {
  if (!indexes) {
    indexes = Promise.all([
      db.collection(CODES).createIndex({ phone: 1 }, { unique: true }),
      db.collection(CODES).createIndex({ code: 1 }, { unique: true }),
      db.collection(REFERRALS).createIndex({ referredPhone: 1 }, { unique: true }),
      db.collection(REFERRALS).createIndex({ referrerPhone: 1 }),
      db.collection(REFERRALS).createIndex({ programmeId: 1, status: 1 }),
    ]).catch((error) => {
      indexes = null;
      console.error('Could not create the referral indexes:', error?.message || error);
    });
  }
  return indexes;
}

export function normaliseReferralCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';
}

export const REFERRAL_CODE = /^MK[A-Z0-9]{6}$/;

function randomCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = 'MK';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** Accounts by phone, whatever form the phone was stored in. */
function phoneFilter(phone: string) {
  const clean = normalisePhone(phone) || phone;
  return { phone: { $in: [clean, `+91${clean}`, `91${clean}`] } };
}

/** The programme customers can refer under right now: active and inside its dates. */
export async function activeProgramme(db: Db, now = new Date()) {
  const candidates = await db
    .collection(PROGRAMMES)
    .find({ status: 'active', audience: { $in: ['customers', 'all'] } })
    .sort({ startDate: -1, createdAt: -1 })
    .toArray();
  return (
    candidates.find(
      (p) => (!p.startDate || new Date(p.startDate) <= now) && (!p.endDate || endOfDay(new Date(p.endDate)) >= now)
    ) || null
  );
}

/** Programme end dates are whole days: a programme ending on the 1st runs to the end of the 1st (India time). */
function endOfDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 3600 * 1000 - 1);
}

export function publicProgramme(p: any) {
  if (!p) return null;
  return {
    name: p.name,
    referrerReward: Number(p.referrerReward) || 0,
    refereeReward: Number(p.refereeReward) || 0,
    conditions: p.conditions || '',
    endDate: p.endDate || null,
  };
}

/** The customer's referral code, made on first request. */
export async function referralCodeFor(db: Db, phone: string): Promise<string> {
  await ensureIndexes(db);
  const codes = db.collection(CODES);
  const existing = await codes.findOne({ phone });
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const code = randomCode();
      await codes.insertOne({ phone, code, createdAt: new Date() });
      return code;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      // Either the phone got a code a moment ago, or the random code is taken.
      const raced = await codes.findOne({ phone });
      if (raced) return raced.code;
    }
  }
  throw new Error('Could not make a referral code');
}

export async function referralStats(db: Db, phone: string) {
  const rows = await db
    .collection(REFERRALS)
    .aggregate([{ $match: { referrerPhone: phone } }, { $group: { _id: '$status', n: { $sum: 1 } } }])
    .toArray();
  const by = Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
  return { signedUp: (by.signed_up || 0) + (by.qualified || 0), qualified: by.qualified || 0 };
}

/** Bookings that count as "a booking" for the claim rule: anything except an order that expired unpaid. */
async function hasBookings(db: Db, phone: string): Promise<boolean> {
  const clean = normalisePhone(phone) || phone;
  const found = await db
    .collection('bookings')
    .findOne({ userPhone: { $in: [clean, `+91${clean}`, `91${clean}`] }, status: { $ne: 'expired' } }, { projection: { _id: 1 } });
  return Boolean(found);
}

export type ClaimResult = { ok: true; referral: any } | { ok: false; error: string; status: number; code: string };

/** A new customer enters a referral code. See the file header for the rules. */
export async function claimReferral(db: Db, phone: string, rawCode: unknown, now = new Date()): Promise<ClaimResult> {
  await ensureIndexes(db);
  const refuse = (error: string, code: string, status = 409): ClaimResult => ({ ok: false, error, status, code });
  const code = normaliseReferralCode(rawCode);
  if (!REFERRAL_CODE.test(code)) return refuse('Enter a valid referral code', 'INVALID_CODE', 400);

  const user = await db.collection('users').findOne(phoneFilter(phone), { projection: { createdAt: 1, accountStatus: 1 } });
  if (!user) return refuse('Finish signing up before entering a referral code', 'NO_ACCOUNT', 404);
  if (user.accountStatus === 'suspended' || user.accountStatus === 'blocked') return refuse('This account cannot use referral codes', 'ACCOUNT_RESTRICTED', 403);
  const created = user.createdAt ? new Date(user.createdAt) : null;
  if (!created || now.getTime() - created.getTime() > CLAIM_WINDOW_DAYS * 24 * 3600 * 1000) {
    return refuse(`A referral code can only be entered within ${CLAIM_WINDOW_DAYS} days of signing up`, 'TOO_LATE');
  }
  if (await db.collection(REFERRALS).findOne({ referredPhone: phone }, { projection: { _id: 1 } })) {
    return refuse('You have already entered a referral code', 'ALREADY_CLAIMED');
  }
  if (await hasBookings(db, phone)) return refuse('A referral code can only be entered before your first booking', 'HAS_BOOKINGS');

  const owner = await db.collection(CODES).findOne({ code });
  if (!owner) return refuse('This referral code does not exist', 'UNKNOWN_CODE', 404);
  if (owner.phone === phone) return refuse('You cannot use your own referral code', 'OWN_CODE');

  const programme = await activeProgramme(db, now);
  if (!programme) return refuse('There is no referral programme running right now', 'NO_PROGRAMME');

  const doc = {
    referrerPhone: owner.phone,
    referredPhone: phone,
    code,
    programmeId: String(programme._id),
    programmeName: programme.name,
    referrerReward: Number(programme.referrerReward) || 0,
    refereeReward: Number(programme.refereeReward) || 0,
    status: 'signed_up',
    rewardStatus: 'pending',
    claimedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const inserted = await db.collection(REFERRALS).insertOne(doc);
    return { ok: true, referral: { ...doc, _id: inserted.insertedId } };
  } catch (error: any) {
    if (error?.code === 11000) return refuse('You have already entered a referral code', 'ALREADY_CLAIMED');
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Qualification and rewards                                           */
/* ------------------------------------------------------------------ */

function isPaidBooking(b: any): boolean {
  return (
    Boolean(b) &&
    (b.status === 'confirmed' || b.status === 'attended') &&
    b.paymentStatus === 'paid' &&
    Boolean(b.gatewayPaymentId) &&
    Number(b.amountPaid ?? b.totalPrice) > 0
  );
}

async function issueRewardCoupon(db: Db, input: { phone: string; amount: number; referralId: string; role: 'referrer' | 'referee'; programmeName: string; now: Date }) {
  const coupons = db.collection('coupons');
  // One coupon per referral and role, even if qualification runs twice.
  const existing = await coupons.findOne({ referralId: input.referralId, referralRole: input.role });
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = 'REF' + randomCode().slice(2);
    const doc = {
      code,
      description: `Referral reward (${input.role === 'referrer' ? 'for referring a friend' : 'welcome reward'}), ${input.programmeName}`,
      discountType: 'flat',
      value: input.amount,
      maxDiscount: null,
      minOrderAmount: null,
      service: 'ticketing',
      validFrom: input.now,
      validUntil: new Date(input.now.getTime() + REWARD_COUPON_DAYS * 24 * 3600 * 1000),
      usageLimit: 1,
      perUserLimit: 1,
      restrictedToPhone: input.phone,
      source: 'referral',
      referralId: input.referralId,
      referralRole: input.role,
      timesUsed: 0,
      status: 'active',
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: 'referral programme',
    };
    try {
      const inserted = await coupons.insertOne(doc);
      return { ...doc, _id: inserted.insertedId };
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const raced = await coupons.findOne({ referralId: input.referralId, referralRole: input.role });
      if (raced) return raced;
    }
  }
  throw new Error('Could not issue the referral reward coupon');
}

/**
 * Called when a booking's payment is confirmed. If the customer was referred
 * and this is their first paid booking, the referral qualifies and the reward
 * coupons are issued. Safe to call any number of times.
 */
export async function qualifyReferralForBooking(db: Db, booking: any, now = new Date()) {
  if (!isPaidBooking(booking)) return null;
  const phone = normalisePhone(String(booking.userPhone || '')) || String(booking.userPhone || '');
  if (!phone) return null;
  const referral = await db.collection(REFERRALS).findOne({ referredPhone: phone, status: 'signed_up' });
  if (!referral) return null;

  // Claim the referral so two confirmations cannot both reward it.
  const claimed = await db
    .collection(REFERRALS)
    .findOneAndUpdate(
      { _id: referral._id, status: 'signed_up' },
      { $set: { status: 'qualified', qualifiedAt: now, qualifyingBookingId: String(booking._id), updatedAt: now } },
      { returnDocument: 'after' }
    );
  if (!claimed) return null;

  const programme = ObjectId.isValid(String(referral.programmeId))
    ? await db.collection(PROGRAMMES).findOne({ _id: new ObjectId(String(referral.programmeId)) })
    : null;
  const programmeLive = programme && programme.status === 'active';
  if (!programmeLive) {
    await db.collection(REFERRALS).updateOne(
      { _id: referral._id },
      { $set: { rewardStatus: 'withheld', rewardNote: 'The programme was no longer active when the referral qualified', updatedAt: now } }
    );
    return { referral: claimed, rewarded: false };
  }

  const referralId = String(referral._id);
  const referrerAmount = Number(referral.referrerReward ?? programme.referrerReward) || 0;
  const refereeAmount = Number(referral.refereeReward ?? programme.refereeReward) || 0;
  const set: Record<string, any> = { rewardStatus: 'given', rewardedAt: now, updatedAt: now };
  if (referrerAmount > 0) {
    const c = await issueRewardCoupon(db, { phone: referral.referrerPhone, amount: referrerAmount, referralId, role: 'referrer', programmeName: programme.name, now });
    set.referrerCouponId = String(c._id);
    set.referrerCouponCode = c.code;
  }
  if (refereeAmount > 0) {
    const c = await issueRewardCoupon(db, { phone: referral.referredPhone, amount: refereeAmount, referralId, role: 'referee', programmeName: programme.name, now });
    set.refereeCouponId = String(c._id);
    set.refereeCouponCode = c.code;
  }
  await db.collection(REFERRALS).updateOne({ _id: referral._id }, { $set: set });
  return { referral: { ...claimed, ...set }, rewarded: true };
}

/** Qualifies referrals whose customer has paid for a booking by a path that did not call qualifyReferralForBooking. */
export async function qualifyPendingReferrals(db: Db, scope: { phones?: string[] } = {}, limit = 200) {
  const filter: Record<string, any> = { status: 'signed_up' };
  if (scope.phones?.length) filter.referredPhone = { $in: scope.phones };
  const pending = await db.collection(REFERRALS).find(filter).limit(limit).toArray();
  let qualified = 0;
  for (const referral of pending) {
    const clean = String(referral.referredPhone);
    const booking = await db
      .collection('bookings')
      .find({
        userPhone: { $in: [clean, `+91${clean}`, `91${clean}`] },
        status: { $in: ['confirmed', 'attended'] },
        paymentStatus: 'paid',
        gatewayPaymentId: { $type: 'string' },
      })
      .sort({ paidAt: 1, createdAt: 1 })
      .limit(1)
      .next();
    if (booking && (await qualifyReferralForBooking(db, booking))) qualified += 1;
  }
  return qualified;
}

/** Counts per programme for the admin screen. */
export async function programmeCounts(db: Db) {
  const rows = await db
    .collection(REFERRALS)
    .aggregate([
      {
        $group: {
          _id: '$programmeId',
          total: { $sum: 1 },
          signedUp: { $sum: { $cond: [{ $eq: ['$status', 'signed_up'] }, 1, 0] } },
          qualified: { $sum: { $cond: [{ $eq: ['$status', 'qualified'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          rewarded: { $sum: { $cond: [{ $eq: ['$rewardStatus', 'given'] }, 1, 0] } },
          withheld: { $sum: { $cond: [{ $eq: ['$rewardStatus', 'withheld'] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  const programmes = await db.collection(PROGRAMMES).find({}).project({ name: 1, status: 1, referrerReward: 1, refereeReward: 1, startDate: 1, endDate: 1 }).toArray();
  const byId = new Map(rows.map((r) => [String(r._id), r]));
  // Rewards issued as coupons and how many of them have been used.
  const rewardCoupons = await db
    .collection('coupons')
    .aggregate([
      { $match: { source: 'referral' } },
      { $group: { _id: null, issued: { $sum: 1 }, used: { $sum: { $cond: [{ $gt: ['$timesUsed', 0] }, 1, 0] } }, value: { $sum: '$value' } } },
    ])
    .toArray();
  return {
    programmes: programmes.map((p) => {
      const r = byId.get(String(p._id));
      return {
        id: String(p._id),
        name: p.name,
        status: p.status,
        referrerReward: p.referrerReward,
        refereeReward: p.refereeReward,
        total: r?.total || 0,
        signedUp: r?.signedUp || 0,
        qualified: r?.qualified || 0,
        rejected: r?.rejected || 0,
        rewarded: r?.rewarded || 0,
        withheld: r?.withheld || 0,
      };
    }),
    rewardCoupons: { issued: rewardCoupons[0]?.issued || 0, used: rewardCoupons[0]?.used || 0, value: rewardCoupons[0]?.value || 0 },
  };
}
