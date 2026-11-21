import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok, toObjectId } from '@/lib/http';
import {
  KYC_VIEWS,
  buildListFilter,
  collectionFor,
  kycFilter,
  listParties,
  maskId,
  parsePaging,
  parseRole,
  partyCounts,
} from '@/app/api/admin/artists/_shared';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * GET /api/kyc?role=artist|organizer&status=pending|approved|rejected|not_submitted&q=&page=&limit=
 * The KYC review queue. Rows carry masked identity numbers and flags saying
 * which documents exist. The document images themselves are only returned by
 * GET /api/admin/kyc/[role]/[id], one record at a time.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'kyc:view');
  if (!check.ok) return check.response;

  try {
    const params = request.nextUrl.searchParams;
    const role = parseRole(params.get('role') || 'organizer');
    if (!role) return fail('Role must be artist or organizer', 400);
    const status = params.get('status') || 'pending';
    if (!KYC_VIEWS.includes(status as any)) return fail('Unknown status', 400);

    const { db } = await connectToDatabase();
    const base = buildListFilter(params, role);
    const filter = { $and: [kycFilter(status)!, base] };

    const paging = parsePaging(params);
    // The review queue is worked oldest first; the other tabs show the latest change first.
    const sort: Record<string, 1 | -1> =
      status === 'pending' ? { updatedAt: 1, _id: 1 } : status === 'not_submitted' ? { createdAt: -1, _id: -1 } : { kycReviewedAt: -1, updatedAt: -1, _id: -1 };

    const [{ rows, total }, artistCounts, organizerCounts] = await Promise.all([
      listParties(db, role, filter, { ...paging, sort }),
      partyCounts(db, 'artist'),
      partyCounts(db, 'organizer'),
    ]);

    const numbers = rows.length
      ? await db
          .collection(collectionFor(role))
          .find({ _id: { $in: rows.map((row) => toObjectId(row._id)!) } }, { projection: { aadharId: 1, panId: 1 } })
          .toArray()
      : [];
    const numberOf = new Map(numbers.map((doc) => [String(doc._id), doc]));

    return ok({
      role,
      status,
      items: rows.map((row) => ({
        ...row,
        aadharMasked: maskId(numberOf.get(row._id)?.aadharId),
        panMasked: maskId(numberOf.get(row._id)?.panId),
      })),
      total,
      page: paging.page,
      limit: paging.limit,
      counts: { artist: artistCounts.kyc, organizer: organizerCounts.kyc },
      canManage: can(check.admin, 'kyc:manage'),
    });
  } catch (error) {
    console.error('Error fetching KYC records:', error);
    return fail('Failed to fetch KYC records', 500);
  }
}
