import type { Db, Document } from 'mongodb';
import type { NextRequest } from 'next/server';
import { escapeRegex, toObjectId } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import type { AdminIdentity } from '@/lib/permissions';
import { accountStatusOf, type AccountStatus } from '@/lib/user-status';

/**
 * Server-side helpers shared by the artist, organiser and KYC admin routes.
 * Not a route: Next.js only treats `route.ts` files as endpoints.
 *
 * The one rule every list in this module follows: never read base64 images
 * (KYC documents, profile photos, portfolio media) into a list response. Lists
 * are built with the projection below, which replaces each image with a
 * true/false flag.
 */

export type PartyRole = 'artist' | 'organizer';

export function collectionFor(role: PartyRole): 'artists' | 'organizers' {
  return role === 'artist' ? 'artists' : 'organizers';
}

export function parseRole(value: unknown): PartyRole | null {
  return value === 'artist' || value === 'organizer' ? value : null;
}

/* ------------------------------------------------------------------ */
/* KYC status                                                          */
/* ------------------------------------------------------------------ */

/**
 * What the admin panel shows for KYC. The stored `kycStatus` keeps the three
 * values the apps rely on ('pending' | 'approved' | 'rejected') and the apps
 * treat a missing value as 'pending'. A profile that has not uploaded any
 * document yet (no `aadharId`) is therefore stored exactly like one waiting
 * for review. The admin panel tells them apart here without changing what is
 * stored:
 *   not_submitted  no decision yet and no Aadhaar number on the profile
 *   pending        documents submitted, waiting for a decision
 */
export type KycView = 'pending' | 'approved' | 'rejected' | 'not_submitted';

export const KYC_VIEWS: KycView[] = ['pending', 'approved', 'rejected', 'not_submitted'];

export function kycViewOf(doc: { kycStatus?: string; kycSubmitted?: boolean; aadharId?: any }): KycView {
  if (doc.kycStatus === 'approved' || doc.kycStatus === 'rejected') return doc.kycStatus;
  const submitted = doc.kycSubmitted ?? Boolean(doc.aadharId);
  return submitted ? 'pending' : 'not_submitted';
}

const DECIDED = ['approved', 'rejected'];

export function kycFilter(view: string): Document | null {
  switch (view) {
    case 'approved':
    case 'rejected':
      return { kycStatus: view };
    case 'pending':
      return { kycStatus: { $nin: DECIDED }, aadharId: { $nin: ['', null] } };
    case 'not_submitted':
      // `$in: [null]` also matches documents where the field is missing.
      return { kycStatus: { $nin: DECIDED }, aadharId: { $in: ['', null] } };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Account status                                                      */
/* ------------------------------------------------------------------ */

const RESTRICTED = ['suspended', 'blocked'];

/** Mongo filter for accounts that are neither suspended nor blocked. */
export const ACTIVE_ACCOUNT_FILTER: Document = {
  accountStatus: { $nin: RESTRICTED },
  isActive: { $ne: false },
};

export function accountFilter(status: string): Document | null {
  switch (status) {
    case 'active':
      return ACTIVE_ACCOUNT_FILTER;
    case 'blocked':
      return { accountStatus: 'blocked' };
    case 'suspended':
      return { $or: [{ accountStatus: 'suspended' }, { accountStatus: { $nin: RESTRICTED }, isActive: false }] };
    default:
      return null;
  }
}

/** Artists the public apps may see: KYC approved and not restricted by an admin. */
export const PUBLIC_ARTIST_FILTER: Document = { kycStatus: 'approved', ...ACTIVE_ACCOUNT_FILTER };

/* ------------------------------------------------------------------ */
/* Portfolio media review                                              */
/* ------------------------------------------------------------------ */

/**
 * Review state of one entry in `artists.media[]`.
 *
 * RULE: media uploaded before portfolio review existed has no `reviewStatus`,
 * and the live apps already show it. So a missing `reviewStatus` counts as
 * APPROVED for public display, and as "not reviewed" in the admin queue. Only
 * an explicit 'rejected' hides an item from the public.
 */
export type MediaReview = 'pending' | 'approved' | 'rejected';

export function mediaReviewOf(item: any): MediaReview {
  const status = item && typeof item === 'object' ? item.reviewStatus : undefined;
  return status === 'approved' || status === 'rejected' ? status : 'pending';
}

export function isMediaPublic(item: any): boolean {
  return mediaReviewOf(item) !== 'rejected';
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

const notEmpty = (field: string) => ({ $ne: [{ $ifNull: ['$' + field, ''] }, ''] });
const sizeOf = (field: string) => ({ $cond: [{ $isArray: '$' + field }, { $size: '$' + field }, 0] });

/** Projection for every artist/organiser list. Images become flags, never data. */
export const LIST_PROJECTION: Document = {
  name: 1,
  phone: 1,
  email: 1,
  city: 1,
  genre: 1,
  pricing: 1,
  status: 1,
  kycStatus: 1,
  rejectionNotes: 1,
  kycCorrectionRequested: 1,
  kycReviewedBy: 1,
  kycReviewedAt: 1,
  accountStatus: 1,
  isActive: 1,
  accountStatusReason: 1,
  accountStatusBy: 1,
  accountStatusAt: 1,
  categoryId: 1,
  followersCount: 1,
  createdAt: 1,
  updatedAt: 1,
  kycSubmitted: notEmpty('aadharId'),
  hasPan: notEmpty('panId'),
  hasAadharImage: notEmpty('aadharImage'),
  hasPanImage: notEmpty('panImage'),
  hasProfileImage: notEmpty('profileImage'),
  mediaCount: sizeOf('media'),
  followersListed: sizeOf('followers'),
};

export interface PartyRow {
  _id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  genre: string;
  pricing: any;
  signupStatus: string;
  kycStatus: string;
  kyc: KycView;
  rejectionNotes: string;
  kycCorrectionRequested: boolean;
  kycReviewedBy: string | null;
  kycReviewedAt: Date | null;
  accountStatus: AccountStatus;
  accountStatusReason: string;
  accountStatusBy: string | null;
  accountStatusAt: Date | null;
  categoryId: string | null;
  followers: number;
  mediaCount: number;
  hasProfileImage: boolean;
  hasAadharImage: boolean;
  hasPanImage: boolean;
  hasPan: boolean;
  createdAt: any;
  updatedAt: any;
}

export function followersOf(doc: any): number {
  const stored = parseInt(String(doc?.followersCount ?? ''), 10);
  if (Number.isFinite(stored) && stored > 0) return stored;
  if (typeof doc?.followersListed === 'number') return doc.followersListed;
  return Array.isArray(doc?.followers) ? doc.followers.length : 0;
}

/** Turns a projected document into the row the admin screens use. */
export function toRow(doc: any): PartyRow {
  return {
    _id: String(doc._id),
    name: doc.name || '',
    phone: doc.phone || '',
    email: doc.email || '',
    city: doc.city || '',
    genre: doc.genre || '',
    pricing: doc.pricing ?? null,
    signupStatus: doc.status || '',
    kycStatus: doc.kycStatus || 'pending',
    kyc: kycViewOf(doc),
    rejectionNotes: doc.rejectionNotes || '',
    kycCorrectionRequested: doc.kycCorrectionRequested === true,
    kycReviewedBy: doc.kycReviewedBy || null,
    kycReviewedAt: doc.kycReviewedAt || null,
    accountStatus: accountStatusOf(doc),
    accountStatusReason: doc.accountStatusReason || '',
    accountStatusBy: doc.accountStatusBy || null,
    accountStatusAt: doc.accountStatusAt || null,
    categoryId: doc.categoryId ? String(doc.categoryId) : null,
    followers: followersOf(doc),
    mediaCount: doc.mediaCount || 0,
    hasProfileImage: Boolean(doc.hasProfileImage),
    hasAadharImage: Boolean(doc.hasAadharImage),
    hasPanImage: Boolean(doc.hasPanImage),
    hasPan: Boolean(doc.hasPan),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

/** Builds the Mongo filter for a list from its query string. */
export function buildListFilter(params: URLSearchParams, role: PartyRole): Document {
  const and: Document[] = [];

  const q = (params.get('q') || '').trim().slice(0, 100);
  if (q) {
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    const or: Document[] = [{ name: regex }, { phone: regex }, { email: regex }, { city: regex }];
    if (role === 'artist') or.push({ genre: regex });
    and.push({ $or: or });
  }

  const kyc = kycFilter(params.get('kyc') || '');
  if (kyc) and.push(kyc);

  const account = accountFilter(params.get('account') || '');
  if (account) and.push(account);

  const city = (params.get('city') || '').trim().slice(0, 100);
  if (city) and.push({ city: { $regex: '^' + escapeRegex(city) + '$', $options: 'i' } });

  if (role === 'artist') {
    const category = (params.get('categoryId') || '').trim();
    if (category === 'none') and.push({ categoryId: { $in: ['', null] } });
    else {
      // A comma-separated list is accepted so a category can be searched together with its subcategories.
      const ids = category.split(',').filter((id) => toObjectId(id)).slice(0, 200);
      if (ids.length) and.push({ categoryId: { $in: ids } });
    }
  }

  return and.length ? { $and: and } : {};
}

const SORTABLE = new Set(['name', 'city', 'createdAt', 'updatedAt', 'kycReviewedAt', 'followersCount']);

export function parsePaging(params: URLSearchParams, maxLimit = 100) {
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(params.get('limit') || '25', 10) || 25));
  const sortKey = SORTABLE.has(params.get('sort') || '') ? (params.get('sort') as string) : 'createdAt';
  const dir: 1 | -1 = params.get('dir') === 'asc' ? 1 : -1;
  return { page, limit, sort: { [sortKey]: dir, _id: -1 } as Record<string, 1 | -1> };
}

export const EXPORT_LIMIT = 5000;

/** One page of projected rows plus the total, without touching any image data. */
export async function listParties(
  db: Db,
  role: PartyRole,
  filter: Document,
  paging: { page: number; limit: number; sort: Record<string, 1 | -1> }
) {
  const collection = db.collection(collectionFor(role));
  const [docs, total] = await Promise.all([
    collection
      .aggregate(
        [
          { $match: filter },
          { $project: LIST_PROJECTION },
          { $sort: paging.sort },
          { $skip: (paging.page - 1) * paging.limit },
          { $limit: paging.limit },
        ],
        { allowDiskUse: true }
      )
      .toArray(),
    collection.countDocuments(filter),
  ]);
  return { rows: docs.map(toRow), total };
}

/** Number of profiles in each KYC view and account state, for tabs and filters. */
export async function partyCounts(db: Db, role: PartyRole) {
  const collection = db.collection(collectionFor(role));
  const [total, pending, approved, rejected, notSubmitted, suspended, blocked] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments(kycFilter('pending')!),
    collection.countDocuments(kycFilter('approved')!),
    collection.countDocuments(kycFilter('rejected')!),
    collection.countDocuments(kycFilter('not_submitted')!),
    collection.countDocuments(accountFilter('suspended')!),
    collection.countDocuments(accountFilter('blocked')!),
  ]);
  return {
    total,
    kyc: { pending, approved, rejected, not_submitted: notSubmitted },
    account: { active: total - suspended - blocked, suspended, blocked },
  };
}

export async function distinctCities(db: Db, role: PartyRole): Promise<string[]> {
  const values = await db.collection(collectionFor(role)).distinct('city');
  const seen = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const key = value.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, value.trim());
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

/** Loads one profile through the list projection (no image data). */
export async function findParty(db: Db, role: PartyRole, id: string): Promise<PartyRow | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const docs = await db
    .collection(collectionFor(role))
    .aggregate([{ $match: { _id: oid } }, { $project: LIST_PROJECTION }])
    .toArray();
  return docs[0] ? toRow(docs[0]) : null;
}

/* ------------------------------------------------------------------ */
/* Events, history                                                     */
/* ------------------------------------------------------------------ */

export const EVENT_PROJECTION: Document = {
  name: 1,
  category: 1,
  status: 1,
  startDate: 1,
  startTime: 1,
  endDate: 1,
  location: 1,
  venue: 1,
  organizerId: 1,
  creatorRole: 1,
  artists: 1,
  artistResponse: 1,
  createdAt: 1,
};

export function toEventRow(event: any, forId?: string) {
  const location = event.location && typeof event.location === 'object' ? event.location : null;
  return {
    _id: String(event._id),
    name: event.name || '',
    category: event.category || '',
    status: event.status || 'pending',
    startDate: event.startDate || null,
    startTime: event.startTime || '',
    city: location?.city || '',
    place: location?.name || location?.address || (typeof event.venue === 'string' && !toObjectId(event.venue) ? event.venue : ''),
    createdAt: event.createdAt || null,
    ...(forId
      ? {
          relation: String(event.organizerId || '') === forId ? 'created' : 'invited',
          artistResponse: event.artistResponse || '',
        }
      : {}),
  };
}

/** Events an artist is part of: invited through `artists`, or created by the artist. */
export function artistEventsFilter(id: string): Document {
  const oid = toObjectId(id);
  const ids: any[] = oid ? [oid, id] : [id];
  return { $or: [{ artists: { $in: ids } }, { organizerId: { $in: ids } }] };
}

export function organizerEventsFilter(id: string): Document {
  const oid = toObjectId(id);
  return { organizerId: { $in: oid ? [oid, id] : [id] } };
}

/** Admin activity recorded against one profile, newest first. */
export async function historyFor(db: Db, role: PartyRole, id: string, module?: string, limit = 50) {
  const filter: Document = { entityType: role, entityId: id, action: { $nin: ['view_documents', 'export'] } };
  if (module) filter.module = module;
  const rows = await db.collection('auditLogs').find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return rows.map((row) => ({
    _id: String(row._id),
    action: row.action,
    module: row.module,
    adminName: row.adminName || row.adminEmail || 'Admin',
    adminEmail: row.adminEmail || null,
    before: row.before || null,
    after: row.after || null,
    reason: row.reason || null,
    meta: row.meta || null,
    createdAt: row.createdAt,
  }));
}

/** Shows only the last four characters of an identity number. */
export function maskId(value: unknown): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!text) return '';
  return text.length <= 4 ? '****' : '*'.repeat(Math.min(8, text.length - 4)) + text.slice(-4);
}

/* ------------------------------------------------------------------ */
/* Suspend and reactivate                                              */
/* ------------------------------------------------------------------ */

/**
 * Suspends or reactivates an artist or organiser account. A reason is always
 * required and the change is written to the activity log. `isActive` is kept
 * in step with `accountStatus` (see lib/user-status.ts).
 */
export async function changeAccountStatus(args: {
  db: Db;
  role: PartyRole;
  id: string;
  action: 'suspend' | 'reactivate';
  reason: string;
  admin: AdminIdentity;
  request: NextRequest;
}): Promise<{ error: string; status: number } | { row: PartyRow }> {
  const { db, role, id, action, reason, admin, request } = args;
  const label = role === 'artist' ? 'Artist' : 'Organiser';

  const existing = await findParty(db, role, id);
  if (!existing) return { error: `${label} not found`, status: 404 };
  if (!reason) return { error: 'A reason is required for this action.', status: 400 };

  const next: AccountStatus = action === 'suspend' ? 'suspended' : 'active';
  if (existing.accountStatus === next) {
    return { error: `This account is already ${next}.`, status: 409 };
  }

  const now = new Date();
  await db.collection(collectionFor(role)).updateOne(
    { _id: toObjectId(id)! },
    {
      $set: {
        accountStatus: next,
        isActive: next === 'active',
        accountStatusReason: reason,
        accountStatusBy: admin.email || admin.name || null,
        accountStatusAt: now,
        updatedAt: now,
      },
    }
  );

  await logAudit({
    admin,
    action: action === 'suspend' ? 'suspend' : 'reactivate',
    module: role === 'artist' ? 'artists' : 'organizers',
    entityType: role,
    entityId: id,
    entityLabel: existing.name || existing.phone,
    before: { accountStatus: existing.accountStatus },
    after: { accountStatus: next },
    reason,
    request,
  });

  return { row: (await findParty(db, role, id))! };
}
