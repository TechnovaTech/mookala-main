import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, ok, toObjectId } from '@/lib/http';
import { countAudience, getChannelConfig, logDelivery, messageBlocker, resolveAudience } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const SENDABLE = ['approved', 'scheduled', 'failed'];

/**
 * Sends an approved push campaign.
 *
 * No push provider integration exists and the apps do not register device
 * tokens, so today every attempt is recorded as "not sent" and the campaign
 * moves to "failed" with the reason. It never moves to "sent" unless a
 * provider accepted at least one message.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'marketing:manage');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid campaign id');

  try {
    const { db } = await connectToDatabase();
    const campaigns = db.collection('pushCampaigns');
    const campaign = await campaigns.findOne({ _id: oid });
    if (!campaign) return fail('Campaign not found', 404);

    if (!SENDABLE.includes(campaign.status) || !campaign.approvedBy) {
      return fail('Only an approved campaign can be sent. Submit it for approval first.', 409);
    }
    if (campaign.status === 'scheduled' && campaign.scheduledFor && new Date(campaign.scheduledFor) > new Date()) {
      return fail('This campaign is scheduled for later. Move it back to Draft and have it approved again to send it now.', 409);
    }

    const parts = await resolveAudience(db, campaign.audience, campaign.audienceValue);
    if (typeof parts === 'string') return fail(parts);
    const { total, breakdown } = await countAudience(db, parts);

    // Claim the campaign so two admins cannot send it at the same moment.
    const claimed = await campaigns.updateOne({ _id: oid, status: campaign.status }, { $set: { status: 'sending', updatedAt: new Date() } });
    if (claimed.modifiedCount !== 1) return fail('This campaign was changed by someone else. Reload and try again.', 409);

    const config = await getChannelConfig(db, 'push');
    const problem =
      messageBlocker(config) ||
      // Reached only once a push adapter exists: there is still nobody to send to.
      'no account has a registered device token';

    const logId = await logDelivery(db, {
      channel: 'push',
      to: `${total} account${total === 1 ? '' : 's'} (${breakdown.map((b) => b.label).join(', ')})`,
      subject: campaign.title,
      body: campaign.message,
      status: 'not_sent',
      error: problem,
      campaignId: String(campaign._id),
      campaignType: 'push-campaign',
      kind: 'campaign',
      bulk: true,
      provider: config.provider,
      attempt: (campaign.attempts || 0) + 1,
      requestedBy: check.admin.email || null,
    });

    const failureReason = `Not sent: ${problem}`;
    const now = new Date();
    await campaigns.updateOne(
      { _id: oid },
      {
        $set: {
          status: 'failed',
          statusReason: failureReason,
          statusChangedAt: now,
          statusChangedBy: check.admin.email || null,
          failureReason,
          lastAttemptAt: now,
          audienceCount: total,
          acceptedCount: 0,
          updatedAt: now,
          updatedBy: check.admin.email || null,
        },
        $inc: { attempts: 1 },
      }
    );

    await logAudit({
      admin: check.admin,
      action: 'send_attempt',
      module: 'marketing',
      entityType: 'push-campaigns',
      entityId: String(campaign._id),
      entityLabel: campaign.title,
      before: { status: campaign.status },
      after: { status: 'failed', failureReason, audienceCount: total, acceptedCount: 0 },
      request,
    });

    return ok({ sent: false, status: 'failed', reason: failureReason, audience: { total, breakdown }, accepted: 0, logId });
  } catch (error) {
    console.error('Push campaign send failed:', error);
    return fail('Failed to send the campaign', 500);
  }
}
