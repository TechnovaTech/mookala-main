import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { csvResponse, fail, ok, toCsv, toObjectId } from '@/lib/http';
import {
  EXPORT_LIMIT,
  buildListFilter,
  distinctCities,
  listParties,
  parsePaging,
  partyCounts,
} from '@/app/api/admin/artists/_shared';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

const KYC_LABEL: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  not_submitted: 'Not submitted',
};

/**
 * GET /api/organizers   (admin, 'organizers:view')
 * Organiser list: search (q), filters (kyc, account, city), sorting,
 * pagination and CSV export (export=csv). Rows are projected: no KYC numbers,
 * no KYC or profile images.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'organizers:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;
    const filter = buildListFilter(params, 'organizer');
    const paging = parsePaging(params);

    if (params.get('export') === 'csv') {
      const { rows } = await listParties(db, 'organizer', filter, { ...paging, page: 1, limit: EXPORT_LIMIT });
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'organizers',
        entityType: 'organizer',
        meta: { rows: rows.length, query: Object.fromEntries(params.entries()) },
        request,
      });
      return csvResponse(
        toCsv(
          rows.map((row) => ({ ...row, kyc: KYC_LABEL[row.kyc] })),
          [
            { key: 'name', label: 'Name' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'city', label: 'City' },
            { key: 'kyc', label: 'KYC status' },
            { key: 'kycReviewedBy', label: 'KYC reviewed by' },
            { key: 'kycReviewedAt', label: 'KYC reviewed at' },
            { key: 'accountStatus', label: 'Account status' },
            { key: 'accountStatusReason', label: 'Restriction reason' },
            { key: 'createdAt', label: 'Joined' },
          ]
        ),
        `organisers-${new Date().toISOString().slice(0, 10)}.csv`
      );
    }

    const [{ rows, total }, counts, cities] = await Promise.all([
      listParties(db, 'organizer', filter, paging),
      partyCounts(db, 'organizer'),
      distinctCities(db, 'organizer'),
    ]);

    // Number of events per organiser on this page.
    const ids = rows.map((row) => row._id);
    const eventCounts = ids.length
      ? await db
          .collection('events')
          .aggregate([
            { $match: { organizerId: { $in: [...ids, ...ids.map((id) => toObjectId(id))] } } },
            { $group: { _id: { $toString: '$organizerId' }, count: { $sum: 1 } } },
          ])
          .toArray()
      : [];
    const eventsOf = new Map(eventCounts.map((row) => [String(row._id), row.count as number]));

    const items = rows.map((row) => ({ ...row, events: eventsOf.get(row._id) || 0 }));

    return ok({
      items,
      // Kept for older callers of this endpoint.
      organizers: items,
      count: items.length,
      total,
      page: paging.page,
      limit: paging.limit,
      counts,
      cities,
      canManage: can(check.admin, 'organizers:manage'),
    });
  } catch (error) {
    console.error('Error fetching organizers:', error);
    return fail('Failed to fetch organizers', 500);
  }
}
