import { NextRequest } from 'next/server';
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
} from './_shared';

export const dynamic = 'force-dynamic';

const KYC_LABEL: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  not_submitted: 'Not submitted',
};

/**
 * GET /api/admin/artists
 * Artist list for the admin panel: search (q), filters (kyc, account,
 * categoryId, city), sorting, pagination and CSV export (export=csv).
 * Never returns KYC numbers, KYC images or media data.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'artists:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;
    const paging = parsePaging(params);

    const categories = await db
      .collection('artistCategories')
      .find({}, { projection: { name: 1, parentId: 1, status: 1, displayOrder: 1 } })
      .sort({ displayOrder: 1, name: 1 })
      .limit(500)
      .toArray();
    const categoryName = new Map(categories.map((c) => [String(c._id), String(c.name || '')]));

    // Filtering by a category also includes artists placed in its subcategories.
    const wanted = params.get('categoryId') || '';
    const query = new URLSearchParams(params);
    if (toObjectId(wanted)) {
      const children = categories.filter((c) => String(c.parentId || '') === wanted).map((c) => String(c._id));
      query.set('categoryId', [wanted, ...children].join(','));
    }
    const filter = buildListFilter(query, 'artist');

    if (params.get('export') === 'csv') {
      const { rows } = await listParties(db, 'artist', filter, { ...paging, page: 1, limit: EXPORT_LIMIT });
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'artists',
        entityType: 'artist',
        meta: { rows: rows.length, query: Object.fromEntries(params.entries()) },
        request,
      });
      const flat = rows.map((row) => ({
        ...row,
        category: row.categoryId ? categoryName.get(row.categoryId) || '' : '',
        kyc: KYC_LABEL[row.kyc],
      }));
      return csvResponse(
        toCsv(flat, [
          { key: 'name', label: 'Name' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'city', label: 'City' },
          { key: 'genre', label: 'Genre' },
          { key: 'category', label: 'Category' },
          { key: 'kyc', label: 'KYC status' },
          { key: 'kycReviewedBy', label: 'KYC reviewed by' },
          { key: 'kycReviewedAt', label: 'KYC reviewed at' },
          { key: 'accountStatus', label: 'Account status' },
          { key: 'accountStatusReason', label: 'Restriction reason' },
          { key: 'followers', label: 'Followers' },
          { key: 'mediaCount', label: 'Portfolio items' },
          { key: 'createdAt', label: 'Joined' },
        ]),
        `artists-${new Date().toISOString().slice(0, 10)}.csv`
      );
    }

    const [{ rows, total }, counts, cities] = await Promise.all([
      listParties(db, 'artist', filter, paging),
      partyCounts(db, 'artist'),
      distinctCities(db, 'artist'),
    ]);

    return ok({
      items: rows.map((row) => ({
        ...row,
        categoryName: row.categoryId ? categoryName.get(row.categoryId) || null : null,
        // The image itself is served by /api/images; the list only carries the link.
        profileImageUrl: row.hasProfileImage
          ? `/api/images/${row._id}?type=profile&v=${row.updatedAt ? new Date(row.updatedAt).getTime() : 0}`
          : null,
      })),
      total,
      page: paging.page,
      limit: paging.limit,
      counts,
      cities,
      categories: categories.map((c) => ({
        _id: String(c._id),
        name: c.name || '',
        parentId: c.parentId && toObjectId(String(c.parentId)) ? String(c.parentId) : null,
        status: c.status || 'active',
      })),
      canManage: can(check.admin, 'artists:manage'),
    });
  } catch (error) {
    console.error('Admin artists list failed:', error);
    return fail('Failed to load artists', 500);
  }
}
