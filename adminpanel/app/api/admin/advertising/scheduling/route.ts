import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok, toObjectId } from '@/lib/http';
import { DAY_MS, PLACEMENT_FEED, effectiveStatus, hasCreative, startOfToday, syncCampaignStatuses, toDate } from '../_lib/campaigns';

export const dynamic = 'force-dynamic';

const MAX_WEEKS = 26;

/**
 * GET /api/admin/advertising/scheduling?weeks=8&from=YYYY-MM-DD
 *
 * Campaigns that touch the window, grouped by placement, each with the status
 * its dates give it today and the other campaigns it overlaps on the same
 * placement. Drafts are included (they hold a slot once approved); rejected
 * campaigns are not. Opening this brings stored statuses up to date first.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'ads:view');
  if (!check.ok) return check.response;

  try {
    const params = request.nextUrl.searchParams;
    const weeksRaw = parseInt(params.get('weeks') || '8', 10);
    const weeks = Number.isFinite(weeksRaw) ? Math.min(MAX_WEEKS, Math.max(1, weeksRaw)) : 8;

    let from = startOfToday();
    const fromRaw = params.get('from');
    if (fromRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || Number.isNaN(new Date(fromRaw + 'T00:00:00.000Z').getTime())) {
        return fail('The start of the window is not a valid date.');
      }
      from = new Date(fromRaw + 'T00:00:00.000Z');
    }
    const to = new Date(from.getTime() + weeks * 7 * DAY_MS - 1);

    const { db } = await connectToDatabase();
    const synced = await syncCampaignStatuses(db, { admin: null, request, trigger: 'scheduling screen opened' });

    const campaigns = await db
      .collection('adCampaigns')
      .find({ status: { $ne: 'rejected' }, startDate: { $lte: to }, endDate: { $gte: new Date(from.getTime() - DAY_MS + 1) } })
      .sort({ startDate: 1, createdAt: 1 })
      .toArray();

    const advertiserIds = Array.from(new Set(campaigns.map((c) => String(c.advertiser))))
      .map((value) => toObjectId(value))
      .filter(Boolean) as ObjectId[];
    const advertisers = advertiserIds.length
      ? await db.collection('advertisers').find({ _id: { $in: advertiserIds } }).project({ businessName: 1, status: 1 }).toArray()
      : [];
    const advertiserOf = new Map(advertisers.map((a) => [String(a._id), a]));

    const now = new Date();
    const rows = campaigns.map((c) => {
      const start = toDate(c.startDate) as Date;
      const end = toDate(c.endDate) as Date;
      const advertiser = advertiserOf.get(String(c.advertiser));
      return {
        _id: String(c._id),
        name: String(c.name || ''),
        advertiserId: String(c.advertiser || ''),
        advertiser: advertiser?.businessName || 'Deleted advertiser',
        advertiserStatus: advertiser?.status || null,
        placement: String(c.placement || ''),
        startDate: start,
        endDate: end,
        targetLocations: Array.isArray(c.targetLocations) ? c.targetLocations : [],
        storedStatus: String(c.status || ''),
        status: effectiveStatus(c, now),
        statusReason: c.statusReason || null,
        hasCreative: hasCreative(c),
        overlaps: [] as { _id: string; name: string; from: Date; to: Date; sameCity: boolean }[],
      };
    });

    // Two campaigns overlap when they share a placement and at least one day.
    // Drafts, completed and paused campaigns are compared too, so a clash is
    // visible before a campaign is approved or resumed.
    const cities = (list: string[]) => list.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        if (a.placement !== b.placement) continue;
        if (a.status === 'completed' || b.status === 'completed') continue;
        const overlapFrom = a.startDate > b.startDate ? a.startDate : b.startDate;
        const overlapTo = a.endDate < b.endDate ? a.endDate : b.endDate;
        if (overlapFrom.getTime() > overlapTo.getTime()) continue;
        const ca = cities(a.targetLocations);
        const cb = cities(b.targetLocations);
        const sameCity = ca.length === 0 || cb.length === 0 || ca.some((city) => cb.includes(city));
        a.overlaps.push({ _id: b._id, name: b.name, from: overlapFrom, to: overlapTo, sameCity });
        b.overlaps.push({ _id: a._id, name: a.name, from: overlapFrom, to: overlapTo, sameCity });
      }
    }

    const placements = Array.from(new Set(rows.map((r) => r.placement))).sort();
    return ok({
      window: { from, to, weeks },
      today: startOfToday(now),
      placements: placements.map((placement) => ({
        placement,
        shownInApp: PLACEMENT_FEED[placement] || null,
        campaigns: rows.filter((r) => r.placement === placement),
      })),
      totals: {
        campaigns: rows.length,
        live: rows.filter((r) => r.status === 'live').length,
        scheduled: rows.filter((r) => r.status === 'scheduled').length,
        paused: rows.filter((r) => r.status === 'paused').length,
        draft: rows.filter((r) => r.status === 'draft').length,
        overlapping: rows.filter((r) => r.overlaps.length > 0).length,
      },
      synced,
      canManage: can(check.admin, 'ads:manage'),
    });
  } catch (error) {
    console.error('Campaign scheduling failed:', error);
    return fail('Failed to load the campaign schedule', 500);
  }
}
