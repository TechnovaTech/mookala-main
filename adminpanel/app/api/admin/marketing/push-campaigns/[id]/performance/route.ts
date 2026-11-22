import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, toObjectId } from '@/lib/http';
import { LOG_COLLECTION } from '@/lib/notifications';
import { campaignTotals } from '@/lib/push-campaigns';

export const dynamic = 'force-dynamic';

function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 10000) / 100 : null;
}

/**
 * GET: how a push campaign performed, one figure per device.
 *   targeted   devices the campaign was addressed to
 *   accepted   accepted by the push provider (FCM)
 *   delivered  reported delivered by the provider (FCM does not report this, so it stays 0 for push)
 *   failed     refused by the provider, or not handed over
 *   opened     customers who opened it (reported by the app)
 *   CTR        opened / accepted
 * plus the latest delivery log entries of the campaign.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'marketing:view');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid campaign id');

  try {
    const { db } = await connectToDatabase();
    const campaign = await db.collection('pushCampaigns').findOne({ _id: oid });
    if (!campaign) return fail('Campaign not found', 404);

    const totals = await campaignTotals(db, params.id);
    const recent = await db
      .collection(LOG_COLLECTION)
      .find({ campaignId: params.id, channel: 'push' }, { projection: { to: 1, status: 1, error: 1, provider: 1, kind: 1, attempt: 1, createdAt: 1, recipient: 1 } })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    return ok({
      campaign: {
        id: params.id,
        title: campaign.title,
        status: campaign.status,
        approvedBy: campaign.approvedBy || null,
        scheduledFor: campaign.scheduledFor || null,
        lastAttemptAt: campaign.lastAttemptAt || null,
        completedAt: campaign.completedAt || null,
        audienceCount: campaign.audienceCount ?? null,
        reachableDevices: campaign.reachableDevices ?? null,
        failureReason: campaign.failureReason || null,
      },
      totals,
      rates: {
        acceptedOfTargeted: rate(totals.accepted, totals.targeted),
        ctr: rate(totals.opened, totals.accepted),
      },
      deliveryReceipts:
        'Firebase Cloud Messaging confirms that it accepted a message but does not report delivery to the device, so "Delivered" is only filled in for providers that send receipts.',
      recent: recent.map((entry) => ({
        id: String(entry._id),
        device: typeof entry.to === 'string' && entry.to.length > 12 ? `${entry.to.slice(0, 6)}…${entry.to.slice(-4)}` : entry.to,
        recipient: entry.recipient?.name || entry.recipient?.type || null,
        status: entry.status,
        error: entry.error || null,
        summary: entry.kind === 'campaign',
        attempt: entry.attempt || 1,
        at: entry.createdAt,
      })),
    });
  } catch (error) {
    console.error('Push campaign performance failed:', error);
    return fail('Could not load the campaign figures', 500);
  }
}
