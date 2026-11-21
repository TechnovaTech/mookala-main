import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminWith, requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString } from '@/lib/http';
import { mediaProblem, placementState, readDate, readPositiveInt } from '@/app/api/admin/catalogue/_lib/shared';
import { servedCampaigns } from '@/app/api/admin/advertising/_lib/campaigns';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ads[?city=<city>]: the user app (no login) receives ads that are
 * active and inside their start and end dates. An admin with ads:view receives
 * every hand-entered ad, each with a `state` of active, inactive, scheduled or
 * expired.
 *
 * Advertiser campaigns placed as "Sponsored card" that are live, inside their
 * dates and have a creative are returned in the same list and in the same
 * shape, each with a `campaignId` so the app can report impressions and
 * clicks. A campaign with target locations is returned only when `city`
 * matches one of them (case does not matter); one with none is returned
 * everywhere.
 */
export async function GET(request: NextRequest) {
  try {
    const isAdmin = isAdminWith(request, 'ads:view');
    const { db } = await connectToDatabase();
    const ads = await db.collection('ads').find({}).sort({ createdAt: -1 }).toArray();
    const now = new Date();
    const city = asString(request.nextUrl.searchParams.get('city'), 80);
    const campaigns = await servedCampaigns(db, 'ads', city);

    return NextResponse.json({
      success: true,
      ads: [
        ...ads
          .map((a) => ({ doc: a, state: placementState(a, now) }))
          .filter(({ state }) => isAdmin || state === 'active')
          .map(({ doc: a, state }) => ({
            _id: a._id.toString(),
            title: a.title,
            image: a.image,
            mediaType: a.mediaType || 'image',
            link: a.link || '',
            sponsor: a.sponsor,
            startDate: a.startDate,
            endDate: a.endDate,
            duration: a.duration || 0,
            order: a.order || 1,
            status: a.status || 'active',
            createdAt: a.createdAt,
            state,
          })),
        ...campaigns.map(({ campaign: c, image, mediaType, sponsor }, index) => ({
          _id: c._id.toString(),
          title: c.name,
          image,
          mediaType,
          link: c.clickUrl || '',
          sponsor,
          startDate: c.startDate,
          endDate: c.endDate,
          duration: 0,
          order: 1000 + index,
          status: 'active',
          createdAt: c.createdAt,
          state: 'active' as const,
          campaignId: c._id.toString(),
        })),
      ],
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch ads' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'ads:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    const reason = asString(body?.reason, 500);
    if (reason.length < 5) {
      return NextResponse.json({ success: false, error: 'Write a reason of at least 5 characters. It is saved in the activity log.' }, { status: 400 });
    }

    const title = asString(body.title, 200);
    const sponsor = asString(body.sponsor, 200);
    if (!title || !sponsor) return NextResponse.json({ success: false, error: 'Title and sponsor are required' }, { status: 400 });
    if (!body.image) return NextResponse.json({ success: false, error: 'Upload an image or a video for the ad' }, { status: 400 });

    const problem = mediaProblem(body.image, 'Ad file', { allowVideo: true });
    if (problem) return problem;

    const link = asString(body.link, 2000);
    if (link && !/^https?:\/\//i.test(link)) {
      return NextResponse.json({ success: false, error: 'Link must start with http:// or https://' }, { status: 400 });
    }

    const startDate = readDate(body.startDate);
    const endDate = readDate(body.endDate);
    if (!startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'A valid start date and end date are required' }, { status: 400 });
    }
    if (endDate < startDate) {
      return NextResponse.json({ success: false, error: 'End date cannot be before the start date' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const doc = {
      title,
      image: body.image,
      mediaType: String(body.image).startsWith('data:video/') || body.mediaType === 'video' ? 'video' : 'image',
      link,
      sponsor,
      startDate,
      endDate,
      duration: readPositiveInt(body.duration, 0, 3600),
      order: Math.max(1, readPositiveInt(body.order, 1)),
      status: body.status === 'inactive' ? 'inactive' : 'active',
      createdAt: new Date(),
      createdBy: check.admin.email || null,
    };
    const result = await db.collection('ads').insertOne(doc);

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'ads',
      entityType: 'ad',
      entityId: String(result.insertedId),
      entityLabel: title,
      after: doc,
      reason,
      request,
    });

    return NextResponse.json({ success: true, adId: result.insertedId });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add ad' }, { status: 500 });
  }
}
