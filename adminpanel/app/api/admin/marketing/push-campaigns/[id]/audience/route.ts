import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, toObjectId } from '@/lib/http';
import { countAudience, getChannelConfig, messageBlocker, resolveAudience } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * Audience preview for a push campaign: the real number of accounts that match
 * the audience right now, the message as it would appear, and whether anything
 * could actually be delivered.
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

    const parts = await resolveAudience(db, campaign.audience, campaign.audienceValue);
    if (typeof parts === 'string') return fail(parts);

    const { total, breakdown } = await countAudience(db, parts);
    const blocker = messageBlocker(await getChannelConfig(db, 'push'));

    return ok({
      campaign: { id: String(campaign._id), title: campaign.title, status: campaign.status, scheduledFor: campaign.scheduledFor || null },
      audience: { total, breakdown },
      // The apps do not register device tokens, so no account can receive a push yet.
      reachable: 0,
      reachableNote: 'No account has a registered device token: the mobile apps do not register for push notifications yet.',
      provider: { connected: !blocker, problem: blocker },
      preview: { title: campaign.title, message: campaign.message, deepLink: campaign.deepLink || null },
    });
  } catch (error) {
    console.error('Push audience preview failed:', error);
    return fail('Failed to work out the audience', 500);
  }
}
