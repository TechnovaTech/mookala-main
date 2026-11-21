import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, escapeRegex, fail, ok, toObjectId } from '@/lib/http';
import { mediaReviewOf, parsePaging } from '../_shared';

export const dynamic = 'force-dynamic';

/**
 * Portfolio review. Each entry in `artists.media[]` carries:
 *   reviewStatus  'pending' | 'approved' | 'rejected'
 *   reviewedBy, reviewedAt, reviewReason
 *
 * RULE for items with no `reviewStatus` (everything uploaded before this
 * screen existed): the live apps already show them, so the public API keeps
 * treating them as approved, while this queue lists them as "not reviewed".
 * Only an explicit 'rejected' hides an item from the public.
 *
 * GET  ?status=pending|approved|rejected&q=&page=&limit=
 * POST { artistId, index, uploadedAt, action: 'approve' | 'reject', reason }
 */
const STATUSES = ['pending', 'approved', 'rejected'];

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'artists:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;
    const status = STATUSES.includes(params.get('status') || '') ? (params.get('status') as string) : 'pending';
    const { page, limit } = parsePaging(params, 60);

    const match: Record<string, any> = { 'media.0': { $exists: true } };
    const q = (params.get('q') || '').trim().slice(0, 100);
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' };
      match.$or = [{ name: regex }, { phone: regex }, { city: regex }];
    }
    const artistId = toObjectId(params.get('artistId') || '');
    if (artistId) match._id = artistId;

    const [result] = await db
      .collection('artists')
      .aggregate(
        [
          { $match: match },
          {
            // Keep the review details and drop the base64 `data` before unwinding.
            $project: {
              name: 1,
              phone: 1,
              city: 1,
              updatedAt: 1,
              media: {
                $map: {
                  input: { $cond: [{ $isArray: '$media' }, '$media', []] },
                  as: 'm',
                  in: {
                    type: '$$m.type',
                    uploadedAt: '$$m.uploadedAt',
                    reviewStatus: '$$m.reviewStatus',
                    reviewedBy: '$$m.reviewedBy',
                    reviewedAt: '$$m.reviewedAt',
                    reviewReason: '$$m.reviewReason',
                  },
                },
              },
            },
          },
          { $unwind: { path: '$media', includeArrayIndex: 'index' } },
          {
            $addFields: {
              review: {
                $cond: [{ $in: ['$media.reviewStatus', ['approved', 'rejected']] }, '$media.reviewStatus', 'pending'],
              },
            },
          },
          {
            $facet: {
              counts: [{ $group: { _id: '$review', count: { $sum: 1 } } }],
              items: [
                { $match: { review: status } },
                { $sort: { 'media.uploadedAt': -1, _id: 1, index: 1 } },
                { $skip: (page - 1) * limit },
                { $limit: limit },
              ],
            },
          },
        ],
        { allowDiskUse: true }
      )
      .toArray();

    const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const row of result?.counts || []) counts[String(row._id)] = row.count;

    return ok({
      items: (result?.items || []).map((row: any) => {
        const id = String(row._id);
        const version = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
        return {
          key: `${id}:${row.index}`,
          artistId: id,
          artistName: row.name || '',
          artistPhone: row.phone || '',
          artistCity: row.city || '',
          index: row.index,
          type: row.media?.type || 'image',
          uploadedAt: row.media?.uploadedAt || null,
          reviewStatus: mediaReviewOf(row.media),
          reviewedBy: row.media?.reviewedBy || null,
          reviewedAt: row.media?.reviewedAt || null,
          reviewReason: row.media?.reviewReason || '',
          url: `/api/images/${id}?type=media&index=${row.index}&v=${version}`,
        };
      }),
      total: counts[status] || 0,
      page,
      limit,
      counts,
      canManage: can(check.admin, 'artists:manage'),
    });
  } catch (error) {
    console.error('Portfolio review list failed:', error);
    return fail('Failed to load portfolio items', 500);
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'artists:manage');
  if (!check.ok) return check.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body', 400);
  }

  const artistId = asString(body?.artistId, 40);
  const oid = toObjectId(artistId);
  if (!oid) return fail('Invalid artist id', 400);
  const index = Number.isInteger(body?.index) && body.index >= 0 && body.index < 10000 ? (body.index as number) : -1;
  if (index < 0) return fail('Invalid portfolio item', 400);
  const action = asString(body?.action, 20);
  if (action !== 'approve' && action !== 'reject') return fail('Unknown action', 400);
  const reason = asString(body?.reason, 1000);
  if (action === 'reject' && !reason) return fail('A reason is required to reject a portfolio item.', 400);

  try {
    const { db } = await connectToDatabase();
    const artists = db.collection('artists');
    const artist = await artists.findOne({ _id: oid }, { projection: { name: 1, phone: 1, media: { $slice: [index, 1] } } });
    if (!artist) return fail('Artist not found', 404);
    const item = Array.isArray(artist.media) ? artist.media[0] : undefined;
    if (item === undefined || item === null) return fail('That portfolio item no longer exists. Reload the list.', 404);

    // The item is addressed by its position, so make sure it is still the one
    // the admin was looking at before changing it.
    const stamp = (value: any) => (value ? new Date(value).getTime() : 0);
    const storedUploadedAt = typeof item === 'object' ? item.uploadedAt : null;
    if (body?.uploadedAt && stamp(body.uploadedAt) !== stamp(storedUploadedAt)) {
      return fail('The portfolio changed since this list was loaded. Reload and try again.', 409);
    }

    const before = mediaReviewOf(item);
    const next = action === 'approve' ? 'approved' : 'rejected';
    if (typeof item === 'object' && item.reviewStatus === next) {
      return fail(`This item is already ${next}.`, 409);
    }

    const now = new Date();
    const review = {
      reviewStatus: next,
      reviewedBy: check.admin.email || check.admin.name || null,
      reviewedAt: now,
      reviewReason: reason,
    };
    const path = `media.${index}`;
    const guard: Record<string, any> = { _id: oid };
    let update: Record<string, any>;
    if (typeof item === 'string') {
      // Very old entries are a bare base64 string; wrap them so they can carry a review.
      guard[path] = item;
      update = { [path]: { data: item, type: 'image', ...review } };
    } else {
      if (storedUploadedAt) guard[`${path}.uploadedAt`] = storedUploadedAt;
      update = Object.fromEntries(Object.entries(review).map(([key, value]) => [`${path}.${key}`, value]));
    }

    const result = await artists.updateOne(guard, { $set: { ...update, updatedAt: now } });
    if (result.matchedCount === 0) {
      return fail('The portfolio changed since this list was loaded. Reload and try again.', 409);
    }

    await logAudit({
      admin: check.admin,
      action: action === 'approve' ? 'media_approve' : 'media_reject',
      module: 'artists',
      entityType: 'artist',
      entityId: artistId,
      entityLabel: artist.name || artist.phone,
      before: { reviewStatus: typeof item === 'object' && item.reviewStatus ? item.reviewStatus : 'not reviewed' },
      after: { reviewStatus: next },
      reason,
      meta: { mediaIndex: index, uploadedAt: storedUploadedAt || null, previousView: before },
      request,
    });

    return ok({ reviewStatus: next, reviewedBy: review.reviewedBy, reviewedAt: now });
  } catch (error) {
    console.error('Portfolio review failed:', error);
    return fail('Failed to save the review', 500);
  }
}
