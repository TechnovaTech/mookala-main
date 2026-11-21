import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp } from '@/lib/auth';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { dayKey, effectiveStatus, matchesCity, syncCampaignStatuses } from '@/app/api/admin/advertising/_lib/campaigns';

export const dynamic = 'force-dynamic';

/**
 * Counts one impression or click on a live advertising campaign.
 *
 *   POST /api/public/ads/track
 *   { "campaignId": "<24-character id>", "type": "impression" | "click", "city"?: "<the viewer's city>" }
 *
 * The user app calls this for items of /api/ads and /api/banners that carry a
 * `campaignId`. An event is counted only while the campaign is live and inside
 * its dates. Two things move together: the lifetime counters on the campaign
 * (`impressions`, `clicks`) and that day's row in `adCampaignStats`
 * ({ campaignId, date: "YYYY-MM-DD" in UTC, impressions, clicks }), which is
 * what the reports use for a date range. Nothing about the campaign is
 * returned.
 *
 * Throttling is basic and held in this server process's memory: at most
 * LIMIT events per IP address per minute. It resets when the server restarts
 * and is not shared between server instances, so it limits accidental floods
 * but is not protection against deliberate click fraud.
 */

const LIMIT = 60;
const WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 10_000;
const hits = new Map<string, { start: number; count: number }>();

function allowed(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start >= WINDOW_MS) {
    if (hits.size >= MAX_TRACKED_IPS) {
      for (const [key, value] of hits) if (now - value.start >= WINDOW_MS) hits.delete(key);
      if (hits.size >= MAX_TRACKED_IPS) hits.clear();
    }
    hits.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= LIMIT;
}

export async function POST(request: NextRequest) {
  if (!allowed(clientIp(request))) return fail('Too many requests. Try again in a minute.', 429);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail('Invalid request body');

  const id = toObjectId(body.campaignId);
  if (!id) return fail('Invalid campaign id');
  if (body.type !== 'impression' && body.type !== 'click') return fail('type must be "impression" or "click"');
  const field = body.type === 'click' ? 'clicks' : 'impressions';
  const city = asString(body.city, 80);

  try {
    const { db } = await connectToDatabase();
    const now = new Date();

    let campaign = await db.collection('adCampaigns').findOne({ _id: id }, { projection: { status: 1, startDate: 1, endDate: 1, targetLocations: 1 } });
    // An unknown, paused or finished campaign is ignored rather than reported as an error.
    if (!campaign) return ok({ counted: false });
    if (effectiveStatus(campaign, now) !== campaign.status) {
      await syncCampaignStatuses(db, { trigger: 'public /api/public/ads/track' });
      campaign = await db.collection('adCampaigns').findOne({ _id: id }, { projection: { status: 1, startDate: 1, endDate: 1, targetLocations: 1 } });
    }
    if (!campaign || campaign.status !== 'live' || effectiveStatus(campaign, now) !== 'live') return ok({ counted: false });
    // A city-targeted campaign is only counted for a viewer in one of its cities.
    if (city && !matchesCity(campaign.targetLocations, city)) return ok({ counted: false });

    const result = await db.collection('adCampaigns').updateOne({ _id: id, status: 'live' }, { $inc: { [field]: 1 } });
    if (result.modifiedCount !== 1) return ok({ counted: false });

    await db.collection('adCampaignStats').updateOne(
      { campaignId: String(id), date: dayKey(now) },
      { $inc: { [field]: 1 }, $setOnInsert: { createdAt: now, [field === 'clicks' ? 'impressions' : 'clicks']: 0 }, $set: { updatedAt: now } },
      { upsert: true }
    );

    return ok({ counted: true });
  } catch (error) {
    console.error('Ad tracking failed:', error);
    return fail('The event could not be recorded.', 500);
  }
}
