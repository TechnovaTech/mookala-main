import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { PUBLIC_ARTIST_FILTER, buildListFilter, listParties, parsePaging } from '@/app/api/admin/artists/_shared';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * GET /api/artists
 *
 * Public: called by the user app and the organiser app without a session.
 * It returns only the fields those apps read (`_id`, `name`, `profileImage`,
 * `bannerImage`, `bio`, `genre`, `media`) plus city, category and follower
 * count. It must never return Aadhaar or PAN numbers or images, the OTP, the
 * email address or the phone number. The response is built from an explicit
 * list of fields, so a field added to the artist document later stays private
 * until it is added here on purpose.
 *
 * Only artists whose KYC is approved and whose account is not suspended or
 * blocked are listed.
 *
 * Portfolio media: an item with no `reviewStatus` was uploaded before
 * portfolio review existed and is already shown by the live apps, so a missing
 * `reviewStatus` is treated as approved here. Only an item an admin explicitly
 * rejected (`reviewStatus: 'rejected'`) is left out.
 *
 * GET /api/artists?all=true is the admin list: it needs 'artists:view' and
 * returns projected rows (no KYC data, no images), paginated.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get('all') === 'true') {
    const check = await requireAdmin(request, 'artists:view');
    if (!check.ok) return check.response;
    try {
      const { db } = await connectToDatabase();
      const paging = parsePaging(params);
      const { rows, total } = await listParties(db, 'artist', buildListFilter(params, 'artist'), paging);
      return ok({ artists: rows, count: rows.length, total, page: paging.page, limit: paging.limit });
    } catch (error) {
      console.error('Error fetching artists for admin:', error);
      return fail('Failed to fetch artists', 500);
    }
  }

  try {
    const { db } = await connectToDatabase();
    const artists = await db
      .collection('artists')
      .aggregate(
        [
          { $match: PUBLIC_ARTIST_FILTER },
          {
            $project: {
              name: 1,
              bio: 1,
              genre: 1,
              city: 1,
              categoryId: 1,
              profileImage: 1,
              bannerImage: 1,
              followersCount: 1,
              createdAt: 1,
              media: {
                $map: {
                  input: {
                    $filter: {
                      input: { $cond: [{ $isArray: '$media' }, '$media', []] },
                      as: 'm',
                      cond: { $ne: ['$$m.reviewStatus', 'rejected'] },
                    },
                  },
                  as: 'm',
                  in: {
                    $cond: [
                      { $eq: [{ $type: '$$m' }, 'object'] },
                      { data: '$$m.data', type: '$$m.type', uploadedAt: '$$m.uploadedAt' },
                      '$$m',
                    ],
                  },
                },
              },
            },
          },
          { $sort: { createdAt: -1, _id: -1 } },
          { $project: { createdAt: 0 } },
        ],
        { allowDiskUse: true }
      )
      .toArray();

    return NextResponse.json({ success: true, artists, count: artists.length });
  } catch (error) {
    console.error('Error fetching artists:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch artists' }, { status: 500 });
  }
}
