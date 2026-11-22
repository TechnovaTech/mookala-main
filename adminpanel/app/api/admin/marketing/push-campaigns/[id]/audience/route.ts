import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, toObjectId } from '@/lib/http';
import { getChannelConfig, messageBlocker } from '@/lib/notifications';
import { previewPushAudience, resolvePushAudience } from '@/lib/push-campaigns';

export const dynamic = 'force-dynamic';

/**
 * GET: audience preview for a push campaign, counted now: the accounts that
 * match the audience, how many of them have a valid device for their app,
 * how many devices would receive the push, whether the push provider can
 * send, and the message as it will appear.
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

    const parts = await resolvePushAudience(db, campaign.audience, campaign.audienceValue);
    if (typeof parts === 'string') return fail(parts);

    const [audience, config] = await Promise.all([previewPushAudience(db, parts), getChannelConfig(db, 'push')]);
    const blocker = messageBlocker(config);

    return ok({
      campaign: { id: String(campaign._id), title: campaign.title, status: campaign.status, scheduledFor: campaign.scheduledFor || null },
      audience,
      provider: { name: config.provider || null, connected: !blocker, problem: blocker },
      preview: { title: campaign.title, message: campaign.message, deepLink: campaign.deepLink || null },
    });
  } catch (error) {
    console.error('Push audience preview failed:', error);
    return fail('Failed to work out the audience', 500);
  }
}
