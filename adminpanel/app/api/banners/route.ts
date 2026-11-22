import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminWith, requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString } from '@/lib/http';
import { mediaProblem, placementState, readDate, readPositiveInt } from '@/app/api/admin/catalogue/_lib/shared';
import { servedCampaigns } from '@/app/api/admin/advertising/_lib/campaigns';
import { servedPromotions } from '@/app/api/admin/marketing/_lib/promotions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/banners[?city=<city>]: the user app (no login) receives banners
 * that are active and inside their dates. An admin with ads:view receives
 * every hand-entered banner.
 *
 * Live promotions placed as "Home screen banner" (Marketing > Promotions) come
 * first, highest priority first, in the same shape, each with `promotionId`
 * and the linked coupon's `couponCode` (also added to the title, which the
 * app reads out as the slide's label). A banner that a live promotion shows is
 * not listed a second time.
 *
 * Advertiser campaigns placed as "Home banner" that are live, inside their
 * dates and have a creative follow the hand-entered banners, in the same
 * shape, each with a `campaignId` so the app can report impressions and
 * clicks. A campaign with target locations is returned only when `city`
 * matches one of them (case does not matter).
 */
export async function GET(request: NextRequest) {
  try {
    const isAdmin = isAdminWith(request, 'ads:view');
    const { db } = await connectToDatabase();
    const banners = await db.collection('banners').find({}).sort({ order: 1, createdAt: -1 }).toArray();
    const now = new Date();
    const city = asString(request.nextUrl.searchParams.get('city'), 80);
    const campaigns = await servedCampaigns(db, 'banners', city);
    // Live promotions for the home banner placement (Marketing > Promotions) come first, highest priority first.
    // Not for the admin screen, which manages hand-entered banners only.
    const promotions = isAdmin ? [] : await servedPromotions(db, 'banners', now);
    const promoted = new Set(promotions.filter((p) => p.artwork.source === 'banner').map((p) => String(p.artwork.id)));

    return NextResponse.json({
      success: true,
      banners: [
        ...promotions.map(({ promotion: p, artwork, couponCode }, index) => ({
          _id: p._id.toString(),
          title: couponCode ? `${p.name} (code ${couponCode})` : p.name,
          image: artwork.image,
          mediaType: artwork.mediaType,
          link: p.link || artwork.link || '',
          order: index - promotions.length,
          status: 'active',
          createdAt: p.createdAt,
          startDate: p.startsAt || null,
          endDate: p.endsAt || null,
          state: 'active' as const,
          promotionId: p._id.toString(),
          couponCode,
        })),
        ...banners
          .map((b) => ({ doc: b, state: placementState(b, now) }))
          // A banner shown by a live promotion is listed once, as the promotion.
          .filter(({ doc }) => isAdmin || !promoted.has(String(doc._id)))
          .filter(({ state }) => isAdmin || state === 'active')
          .map(({ doc: b, state }) => ({
            _id: b._id.toString(),
            title: b.title,
            image: b.image,
            mediaType: b.mediaType || 'image',
            link: b.link || '',
            order: b.order,
            status: b.status || 'active',
            createdAt: b.createdAt,
            startDate: b.startDate || null,
            endDate: b.endDate || null,
            state,
          })),
        ...campaigns.map(({ campaign: c, image, mediaType, sponsor }, index) => ({
          _id: c._id.toString(),
          title: c.name,
          image,
          mediaType,
          link: c.clickUrl || '',
          order: 1000 + index,
          status: 'active',
          createdAt: c.createdAt,
          startDate: c.startDate || null,
          endDate: c.endDate || null,
          state: 'active' as const,
          sponsor,
          campaignId: c._id.toString(),
        })),
      ],
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch banners' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'ads:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });

    const title = asString(body.title, 200);
    if (!title) return NextResponse.json({ success: false, error: 'Banner title is required' }, { status: 400 });
    // Requirements section 16: who changed a banner, and why, is kept in the activity log.
    const reason = asString(body.reason, 500);
    if (reason.length < 5) {
      return NextResponse.json({ success: false, error: 'Write a reason of at least 5 characters. It is saved in the activity log.' }, { status: 400 });
    }
    if (!body.image) return NextResponse.json({ success: false, error: 'Upload an image or a video for the banner' }, { status: 400 });

    const problem = mediaProblem(body.image, 'Banner file', { allowVideo: true });
    if (problem) return problem;

    const link = asString(body.link, 2000);
    if (link && !/^https?:\/\//i.test(link)) {
      return NextResponse.json({ success: false, error: 'Link must start with http:// or https://' }, { status: 400 });
    }

    const startDate = readDate(body.startDate);
    const endDate = readDate(body.endDate);
    if (startDate === undefined || endDate === undefined) {
      return NextResponse.json({ success: false, error: 'Start or end date is not a valid date' }, { status: 400 });
    }
    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json({ success: false, error: 'End date cannot be before the start date' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const doc = {
      title,
      image: body.image,
      mediaType: String(body.image).startsWith('data:video/') || body.mediaType === 'video' ? 'video' : 'image',
      link,
      order: Math.max(1, readPositiveInt(body.order, 1)),
      status: body.status === 'inactive' ? 'inactive' : 'active',
      startDate,
      endDate,
      createdAt: new Date(),
      createdBy: check.admin.email || null,
    };
    const result = await db.collection('banners').insertOne(doc);

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'ads',
      entityType: 'banner',
      entityId: String(result.insertedId),
      entityLabel: title,
      after: doc,
      reason,
      request,
    });

    return NextResponse.json({ success: true, bannerId: result.insertedId });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add banner' }, { status: 500 });
  }
}
