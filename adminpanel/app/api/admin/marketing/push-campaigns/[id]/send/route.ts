import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, ok, toObjectId } from '@/lib/http';
import { SENDABLE_STATUSES, campaignTotals, dispatchDuePushCampaigns } from '@/lib/push-campaigns';

export const dynamic = 'force-dynamic';

/**
 * POST: "Send now" for an approved push campaign (or a failed one, again).
 *
 * Runs the same delivery as the scheduler (lib/push-campaigns.ts) for this
 * campaign only, up to the per-run limit; a larger audience is finished by
 * the scheduler every 15 minutes. Devices that already received the campaign
 * are never sent it again. A campaign scheduled for later is left to the
 * scheduler.
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

    if (!SENDABLE_STATUSES.includes(campaign.status) && campaign.status !== 'sending') {
      return fail('Only an approved campaign can be sent. Submit it for approval first.', 409);
    }
    if (!campaign.approvedBy) return fail('Only an approved campaign can be sent. Submit it for approval first.', 409);
    if (campaign.status === 'scheduled' && campaign.scheduledFor && new Date(campaign.scheduledFor) > new Date()) {
      return fail('This campaign is scheduled for later and will be sent by the scheduler at that time.', 409);
    }

    const run = await dispatchDuePushCampaigns(db, new Date(), { campaignId: params.id, requestedBy: check.admin.email || null });
    const after = await campaigns.findOne({ _id: oid });
    const totals = await campaignTotals(db, params.id);

    await logAudit({
      admin: check.admin,
      action: 'send',
      module: 'marketing',
      entityType: 'push-campaigns',
      entityId: params.id,
      entityLabel: campaign.title,
      before: { status: campaign.status },
      after: {
        status: after?.status,
        attempted: run.attempted,
        accepted: run.sent,
        notAccepted: run.failed,
        failureReason: after?.failureReason || null,
      },
      request,
    });

    return ok({
      status: after?.status || campaign.status,
      sent: totals.accepted > 0,
      run,
      totals,
      audienceCount: after?.audienceCount ?? null,
      reachableDevices: after?.reachableDevices ?? null,
      reason: after?.failureReason || null,
      // Still sending means the per-run limit was reached: the scheduler continues.
      continuesInBackground: after?.status === 'sending',
    });
  } catch (error) {
    console.error('Push campaign send failed:', error);
    return fail('Failed to send the campaign', 500);
  }
}
