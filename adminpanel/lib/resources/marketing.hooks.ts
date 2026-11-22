/**
 * Server-side rules for the marketing resources. Server only.
 *
 * The coupon engine (checking, holding and redeeming a coupon at checkout) is
 * in lib/coupons.ts, referrals in lib/referrals.ts and push delivery in
 * lib/push-campaigns.ts.
 */
import { registerHooks } from '../resource-hooks';
import { can } from '../permissions';
import { SERVICES } from '../ledger';
import { COUPON_CODE, normaliseCouponCode } from '../coupons';
import { resolvePushAudience } from '../push-campaigns';
import { describeArtwork, promotionStatusFor, resolveArtwork } from '../../app/api/admin/marketing/_lib/promotions';

export { evaluateCoupon, normaliseCouponCode } from '../coupons';

/* ------------------------------------------------------------------ */
/* Coupons                                                             */
/* ------------------------------------------------------------------ */

const COUPON_SERVICES = ['all', ...SERVICES.map((s) => s.value as string)];

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
  async beforeCreate({ db, doc }) {
    if (endBeforeStart(doc, 'startsAt', 'endsAt')) return 'Ends at must be after starts at';
    const art = await resolveArtwork(db, doc.bannerRef);
    if (typeof art === 'string') return art;
    doc.artworkSource = describeArtwork(art);
    doc.artworkRef = art.id ? { collection: art.source === 'banner' ? 'banners' : 'ads', id: art.id } : null;
    if (doc.link && !/^https?:\/\//i.test(String(doc.link))) return '"Opens when tapped" must start with http:// or https://';
  },
  async beforeUpdate({ db, existing, changes }) {
    const merged = { ...existing, ...changes };
    if (endBeforeStart(merged, 'startsAt', 'endsAt')) return 'Ends at must be after starts at';
    if (merged.link && !/^https?:\/\//i.test(String(merged.link))) return '"Opens when tapped" must start with http:// or https://';
    if ('bannerRef' in changes) {
      const art = await resolveArtwork(db, merged.bannerRef);
      if (typeof art === 'string') return art;
      changes.artworkSource = describeArtwork(art);
      changes.artworkRef = art.id ? { collection: art.source === 'banner' ? 'banners' : 'ads', id: art.id } : null;
    }
    // A scheduled or live promotion whose dates change follows the new dates.
    if (('startsAt' in changes || 'endsAt' in changes) && (existing.status === 'scheduled' || existing.status === 'live')) {
      changes.status = promotionStatusFor(merged);
    }
  },
  async beforeStatusChange({ db, existing, to }) {
    if (to === 'scheduled' || to === 'live') {
      const art = await resolveArtwork(db, existing.bannerRef, existing.artworkRef);
      if (typeof art === 'string') return art;
      const now = new Date();
      if (existing.endsAt && new Date(existing.endsAt) <= now) return 'This promotion has already ended. Change its dates before scheduling it again.';
      // The dates decide: asking for "live" before the start keeps it scheduled, and the other way round.
      const byDates = promotionStatusFor({ ...existing, status: 'scheduled' }, now);
      return { __status: byDates };
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
  const value = String(record.audienceValue || '').trim();
  if (record.audience === 'city' && !value) return 'Enter the city in "Audience value"';
  if (record.audience === 'followers_of_artist' && !value) return 'Enter the artist\'s ID or phone number in "Audience value"';
  if (record.audience === 'event_attendees' && !value) return 'Enter the event ID or the exact event name in "Audience value"';
  return null;
}

registerHooks('push-campaigns', {
  async beforeCreate({ db, doc }) {
    const problem = audienceProblem(doc);
    if (problem) return problem;
    // The audience value must point at something real (a city may have nobody yet, which is fine).
    if (doc.audience === 'followers_of_artist' || doc.audience === 'event_attendees') {
      const parts = await resolvePushAudience(db, doc.audience, doc.audienceValue);
      if (typeof parts === 'string') return parts;
    }
  },

  async beforeUpdate({ db, existing, changes }) {
    if (existing.status === 'sent' || existing.status === 'sending') return 'A campaign that has been sent cannot be edited';
    if (CONTENT_LOCKED.includes(existing.status)) {
      const touched = CONTENT_FIELDS.filter((key) => key in changes && !same(existing[key], changes[key]));
      if (touched.length) {
        return 'The content and audience of this campaign were approved and cannot be changed. Move it back to Draft to edit it; it will then need approval again.';
      }
    }
    if ('scheduledFor' in changes && !same(existing.scheduledFor, changes.scheduledFor) && existing.status === 'scheduled') {
      if (!changes.scheduledFor) return 'A scheduled campaign needs a time. To send it with "Send now" instead, move it back to Draft, clear the time and have it approved again.';
      if (new Date(changes.scheduledFor) <= new Date()) return '"Scheduled for" is in the past. Choose a later time.';
    }
    const merged = { ...existing, ...changes };
    const problem = audienceProblem(merged);
    if (problem) return problem;
    if (('audience' in changes || 'audienceValue' in changes) && (merged.audience === 'followers_of_artist' || merged.audience === 'event_attendees')) {
      const parts = await resolvePushAudience(db, merged.audience, merged.audienceValue);
      if (typeof parts === 'string') return parts;
    }
  },

  async beforeStatusChange({ db, existing, from, to, admin }) {
    if (to === 'sending' || to === 'sent' || to === 'failed') {
      return 'This status is set by the scheduler and "Send now", not by hand.';
    }
    if (!(PUSH_TRANSITIONS[from] || []).includes(to)) {
      if (to === 'scheduled') return 'Only an approved campaign can be scheduled. Submit it for approval first.';
      if (to === 'approved') return 'Only a campaign that is pending approval can be approved.';
      return `A campaign cannot move from "${from}" to "${to}".`;
    }
    if (to === 'pending_approval') {
      const problem = audienceProblem(existing);
      if (problem) return problem;
      const parts = await resolvePushAudience(db, existing.audience, existing.audienceValue);
      if (typeof parts === 'string') return parts;
      return { submittedBy: admin.email || null, submittedAt: new Date() };
    }
    if (to === 'approved' && from === 'pending_approval') {
      // Four eyes: whoever wrote or submitted the campaign cannot approve it.
      const email = admin.email || '';
      if (email && (email === existing.createdBy || email === existing.submittedBy)) {
        // Unless nobody else could approve it: a panel with a single approver must still be able to send.
        const others = await db
          .collection('admins')
          .find({ status: { $ne: 'disabled' }, email: { $ne: email } }, { projection: { role: 1, extraPermissions: 1 } })
          .toArray();
        const someoneElse = others.some((a: any) =>
          can({ role: a.role, perms: Array.isArray(a.extraPermissions) ? a.extraPermissions : [] }, 'marketing:approve')
        );
        if (someoneElse) return 'A different admin must approve this campaign: you created or submitted it.';
      }
      const approval = { approvedBy: email || null, approvedAt: new Date() };
      // With a time set, approval schedules it; without one it waits for "Send now".
      if (existing.scheduledFor && new Date(existing.scheduledFor) > new Date()) return { ...approval, __status: 'scheduled' };
      if (existing.scheduledFor) return '"Scheduled for" is in the past. Move the campaign back to Draft and choose a later time, or clear it to send with "Send now".';
      return approval;
    }
    if (to === 'scheduled') {
      if (!existing.approvedBy) return 'Only an approved campaign can be scheduled.';
      if (!existing.scheduledFor) return 'Set "Scheduled for" before scheduling the campaign.';
      if (new Date(existing.scheduledFor) <= new Date()) return '"Scheduled for" is in the past. Choose a later time.';
    }
    if (to === 'draft') return { approvedBy: null, approvedAt: null, submittedBy: null, submittedAt: null };
  },
});
