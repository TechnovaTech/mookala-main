import type { NextRequest } from 'next/server';
import { ObjectId, type Db } from 'mongodb';
import { logAudit } from '@/lib/audit';
import type { AdminIdentity } from '@/lib/permissions';

/**
 * Promotions: banner scheduling and promotional placements (requirements
 * section 13). Server only.
 *
 * A promotion that is 'scheduled' or 'live' follows its dates on every read:
 *   before "Starts at"        scheduled
 *   from "Starts at"          live
 *   from "Ends at"            ended
 * Drafts never move by themselves and are never shown.
 *
 * While live, its artwork (a banner or ad found by its title, or an image
 * link) is added to the feed of its placement: GET /api/banners for the home
 * banner carousel, GET /api/ads for the home sponsored cards, in the item
 * shape the apps already read, with the linked coupon's code. The other
 * placements have no screen that reads them yet.
 */

export const PROMOTIONS = 'promotions';
export const PROMOTION_FEED: Record<string, 'banners' | 'ads'> = {
  home_banner: 'banners',
  home_advertisement: 'ads',
};
export const PLACEMENT_LABELS: Record<string, string> = {
  home_banner: 'Home screen banner',
  home_advertisement: 'Home screen advertisement',
  event_listing: 'Event listing',
  event_detail: 'Event detail page',
  checkout: 'Checkout',
  website_home: 'Website home page',
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The status a promotion's dates give it now. Only 'scheduled' and 'live' promotions move. */
export function promotionStatusFor(promotion: any, now = new Date()): string {
  const status = String(promotion?.status || 'draft');
  if (status !== 'scheduled' && status !== 'live') return status;
  const start = toDate(promotion.startsAt);
  const end = toDate(promotion.endsAt);
  if (end && end <= now) return 'ended';
  if (start && start > now) return 'scheduled';
  return 'live';
}

export interface PromotionSyncChange {
  id: string;
  name: string;
  from: string;
  to: string;
}

/** Brings stored statuses in line with the dates. Writes only what is out of date; each change is in the activity log. */
export async function syncPromotionStatuses(
  db: Db,
  context: { admin?: AdminIdentity | null; request?: NextRequest; trigger: string },
  now = new Date()
): Promise<PromotionSyncChange[]> {
  const candidates = await db
    .collection(PROMOTIONS)
    .find({ status: { $in: ['scheduled', 'live'] } })
    .project({ name: 1, status: 1, startsAt: 1, endsAt: 1 })
    .toArray();
  const changes: PromotionSyncChange[] = [];
  for (const p of candidates) {
    const next = promotionStatusFor(p, now);
    if (next === p.status) continue;
    const reason =
      next === 'ended' ? 'Automatic: "Ends at" has passed.' : next === 'live' ? 'Automatic: "Starts at" has arrived.' : 'Automatic: "Starts at" is still ahead.';
    const result = await db.collection(PROMOTIONS).updateOne(
      { _id: p._id, status: p.status },
      { $set: { status: next, statusReason: reason, statusChangedAt: now, statusChangedBy: 'system', updatedAt: now } }
    );
    if (result.modifiedCount !== 1) continue;
    changes.push({ id: String(p._id), name: p.name || '', from: p.status, to: next });
    await logAudit({
      admin: context.admin || null,
      action: 'status_change',
      module: 'marketing',
      entityType: 'promotions',
      entityId: String(p._id),
      entityLabel: p.name || '',
      before: { status: p.status },
      after: { status: next },
      reason,
      meta: { automatic: true, trigger: context.trigger },
      request: context.request,
    });
  }
  return changes;
}

export interface Artwork {
  source: 'banner' | 'ad' | 'url';
  id: string | null;
  title: string;
  image: string;
  mediaType: 'image' | 'video';
  link: string;
  sponsor: string;
  duration: number;
}

const IMAGE_LINK = /^https:\/\/\S+$/i;

function mediaTypeOf(doc: any, image: string): 'image' | 'video' {
  return doc?.mediaType === 'video' || String(image).startsWith('data:video/') || /\.(mp4|webm|mov)(\?|$)/i.test(image) ? 'video' : 'image';
}

/**
 * Finds the artwork a promotion refers to: a banner, then an ad, with exactly
 * that title (any letter case, the most recent one), or an https link.
 * Returns why it cannot be found otherwise.
 */
export async function resolveArtwork(db: Db, bannerRef: unknown, stored?: { collection?: string; id?: string } | null): Promise<Artwork | string> {
  const ref = typeof bannerRef === 'string' ? bannerRef.trim() : '';
  if (!ref) return 'Enter the title of a banner or ad, or an https:// link to the image';

  const load = async (collection: 'banners' | 'ads', filter: Record<string, any>) =>
    db.collection(collection).find(filter).sort({ createdAt: -1 }).limit(1).next();
  const shape = (collection: 'banners' | 'ads', doc: any): Artwork => ({
    source: collection === 'banners' ? 'banner' : 'ad',
    id: String(doc._id),
    title: String(doc.title || ref),
    image: String(doc.image || ''),
    mediaType: mediaTypeOf(doc, String(doc.image || '')),
    link: String(doc.link || ''),
    sponsor: String(doc.sponsor || ''),
    duration: Number(doc.duration) || 0,
  });

  // The record found when the promotion was saved, as long as it still has that title.
  if (stored?.id && (stored.collection === 'banners' || stored.collection === 'ads') && ObjectId.isValid(stored.id)) {
    const doc = await db.collection(stored.collection).findOne({ _id: new ObjectId(stored.id) });
    if (doc && String(doc.title || '').trim().toLowerCase() === ref.toLowerCase()) return shape(stored.collection, doc);
  }
  if (IMAGE_LINK.test(ref)) {
    return { source: 'url', id: null, title: '', image: ref, mediaType: mediaTypeOf(null, ref), link: '', sponsor: '', duration: 0 };
  }
  const exact = { title: { $regex: `^${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };
  const banner = await load('banners', exact);
  if (banner) return shape('banners', banner);
  const ad = await load('ads', exact);
  if (ad) return shape('ads', ad);
  if (/^https?:\/\//i.test(ref)) return 'Image links must start with https://';
  return `No banner or ad is called "${ref}". Use the exact title from the Banners or Advertisements screen, or an https:// link to the image.`;
}

export function describeArtwork(art: Artwork): string {
  if (art.source === 'url') return 'Image link';
  return `${art.source === 'banner' ? 'Banner' : 'Ad'} "${art.title}" (${art.id})`;
}

export interface ServedPromotion {
  promotion: any;
  artwork: Artwork;
  couponCode: string | null;
}

/** The live promotions for one feed, highest priority first, each with its artwork and active coupon code. */
export async function servedPromotions(db: Db, feed: 'banners' | 'ads', now = new Date()): Promise<ServedPromotion[]> {
  await syncPromotionStatuses(db, { trigger: `public /api/${feed}` }, now);
  const placements = Object.keys(PROMOTION_FEED).filter((key) => PROMOTION_FEED[key] === feed);
  const live = (
    await db
      .collection(PROMOTIONS)
      .find({ status: 'live', placement: { $in: placements } })
      .sort({ priority: -1, startsAt: 1, _id: 1 })
      .toArray()
  ).filter((p) => promotionStatusFor(p, now) === 'live');
  if (!live.length) return [];

  const couponIds = live.map((p) => String(p.couponId || '')).filter((id) => ObjectId.isValid(id) && id.length === 24);
  const coupons = couponIds.length
    ? await db
        .collection('coupons')
        .find(
          { _id: { $in: couponIds.map((id) => new ObjectId(id)) } },
          { projection: { code: 1, status: 1, validFrom: 1, validUntil: 1, restrictedToPhone: 1, usageLimit: 1, timesUsed: 1 } }
        )
        .toArray()
    : [];
  const usable = new Map(
    coupons
      .filter(
        (c) =>
          c.status === 'active' &&
          !c.restrictedToPhone &&
          // A coupon that has been fully used is no longer advertised.
          (!c.usageLimit || (c.timesUsed || 0) < c.usageLimit) &&
          (!c.validFrom || new Date(c.validFrom) <= now) &&
          (!c.validUntil || new Date(c.validUntil) > now)
      )
      .map((c) => [String(c._id), String(c.code)])
  );

  const out: ServedPromotion[] = [];
  for (const promotion of live) {
    const artwork = await resolveArtwork(db, promotion.bannerRef, promotion.artworkRef);
    if (typeof artwork === 'string' || !artwork.image) continue;
    out.push({ promotion, artwork, couponCode: usable.get(String(promotion.couponId || '')) || null });
  }
  return out;
}

export interface ScheduleRow {
  id: string;
  name: string;
  placement: string;
  placementLabel: string;
  shownIn: string | null;
  storedStatus: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  couponCode: string | null;
  artwork: string;
  artworkProblem: string | null;
  overlaps: { id: string; name: string; from: string; to: string }[];
}

/** Promotions that touch the window, grouped by placement, with the others each one overlaps on the same placement. */
export async function promotionSchedule(db: Db, from: Date, to: Date, now = new Date()) {
  const rows = await db
    .collection(PROMOTIONS)
    .find({ startsAt: { $lte: to }, endsAt: { $gte: from } })
    .sort({ placement: 1, startsAt: 1, priority: -1 })
    .toArray();
  const couponIds = rows.map((p) => String(p.couponId || '')).filter((id) => ObjectId.isValid(id) && id.length === 24);
  const coupons = couponIds.length
    ? await db.collection('coupons').find({ _id: { $in: couponIds.map((id) => new ObjectId(id)) } }, { projection: { code: 1 } }).toArray()
    : [];
  const codeOf = new Map(coupons.map((c) => [String(c._id), String(c.code)]));

  const out: ScheduleRow[] = [];
  for (const p of rows) {
    const art = await resolveArtwork(db, p.bannerRef, p.artworkRef);
    out.push({
      id: String(p._id),
      name: p.name || '',
      placement: p.placement,
      placementLabel: PLACEMENT_LABELS[p.placement] || p.placement,
      shownIn: PROMOTION_FEED[p.placement] ? `GET /api/${PROMOTION_FEED[p.placement]}` : null,
      storedStatus: p.status,
      status: promotionStatusFor(p, now),
      startsAt: toDate(p.startsAt)?.toISOString() || null,
      endsAt: toDate(p.endsAt)?.toISOString() || null,
      priority: Number(p.priority) || 0,
      couponCode: codeOf.get(String(p.couponId || '')) || null,
      artwork: typeof art === 'string' ? '' : describeArtwork(art),
      artworkProblem: typeof art === 'string' ? art : null,
      overlaps: [],
    });
  }
  // Two promotions overlap when they share a placement and their periods intersect. Drafts and ended ones are left out.
  const competing = (r: ScheduleRow) => r.status === 'scheduled' || r.status === 'live';
  for (const a of out) {
    if (!competing(a) || !a.startsAt || !a.endsAt) continue;
    for (const b of out) {
      if (a === b || !competing(b) || a.placement !== b.placement || !b.startsAt || !b.endsAt) continue;
      const start = a.startsAt > b.startsAt ? a.startsAt : b.startsAt;
      const end = a.endsAt < b.endsAt ? a.endsAt : b.endsAt;
      if (start < end) a.overlaps.push({ id: b.id, name: b.name, from: start, to: end });
    }
  }
  const placements = Object.keys(PLACEMENT_LABELS).map((key) => ({
    placement: key,
    label: PLACEMENT_LABELS[key],
    shownIn: PROMOTION_FEED[key] ? `GET /api/${PROMOTION_FEED[key]}` : null,
    rows: out.filter((r) => r.placement === key),
  }));
  return { from: from.toISOString(), to: to.toISOString(), placements };
}
