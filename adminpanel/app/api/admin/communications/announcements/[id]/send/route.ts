import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, ok, toObjectId } from '@/lib/http';
import {
  MAX_RECIPIENTS_PER_RUN,
  addressFor,
  countAudience,
  findTemplate,
  isChannel,
  loadRecipients,
  resolveAudience,
  sendNotification,
  type Channel,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const SENDABLE = ['approved', 'scheduled', 'failed'];

/**
 * Sends an approved announcement: one message per recipient per channel
 * through sendNotification(), at most MAX_RECIPIENTS_PER_RUN recipients per
 * call. Every attempt is written to the delivery log.
 *
 * The announcement becomes "sent" only if a provider accepted at least one
 * message. If none was accepted it becomes "failed" with the reason.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'communications:manage');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid announcement id');

  try {
    const { db } = await connectToDatabase();
    const announcements = db.collection('announcements');
    const announcement = await announcements.findOne({ _id: oid });
    if (!announcement) return fail('Announcement not found', 404);

    if (!SENDABLE.includes(announcement.status) || !announcement.approvedBy) {
      return fail('Only an approved announcement can be sent. Submit it for approval first.', 409);
    }
    if (announcement.status === 'scheduled' && announcement.scheduledFor && new Date(announcement.scheduledFor) > new Date()) {
      return fail('This announcement is scheduled for later. Move it back to Draft and have it approved again to send it now.', 409);
    }

    const channels = ((announcement.channels || []) as string[]).filter(isChannel) as Channel[];
    if (channels.length === 0) return fail('Choose at least one channel');

    // Bulk and emergency messages may only use approved templates.
    for (const channel of channels) {
      const template = await findTemplate(db, announcement.templateKey, channel);
      if (!template) {
        return fail(`No ${channel} template has the key "${announcement.templateKey}". Create it and have it approved first.`, 409);
      }
      if (template.status !== 'approved') {
        return fail(`The ${channel} template "${announcement.templateKey}" is not approved. Announcements may only use approved templates.`, 409);
      }
    }

    const parts = await resolveAudience(db, announcement.audience);
    if (typeof parts === 'string') return fail(parts);
    const { total } = await countAudience(db, parts);

    // An approved announcement that was partly processed continues; a failed one starts again.
    const continuing = announcement.status === 'approved' && (announcement.recipientsProcessed || 0) > 0;
    const start = continuing ? announcement.recipientsProcessed : 0;
    const recipients = await loadRecipients(db, parts, start, MAX_RECIPIENTS_PER_RUN);

    const run = { accepted: 0, failed: 0, not_sent: 0 };
    const errors = new Map<string, number>();
    for (const recipient of recipients) {
      for (const channel of channels) {
        const result = await sendNotification(db, {
          channel,
          to: addressFor(recipient, channel),
          templateKey: announcement.templateKey,
          variables: { title: announcement.title, message: announcement.message, name: recipient.name || 'Customer' },
          campaignId: String(announcement._id),
          campaignType: 'announcement',
          bulk: true,
          requestedBy: check.admin.email || null,
        });
        run[result.status] += 1;
        if (result.error) errors.set(result.error, (errors.get(result.error) || 0) + 1);
      }
    }

    const processed = start + recipients.length;
    const totals = {
      accepted: (continuing ? announcement.acceptedCount || 0 : 0) + run.accepted,
      failed: (continuing ? announcement.failedCount || 0 : 0) + run.failed,
      notSent: (continuing ? announcement.notSentCount || 0 : 0) + run.not_sent,
    };
    const commonest = Array.from(errors.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    let status: string;
    let failureReason: string;
    if (total === 0) {
      status = 'failed';
      failureReason = 'Not sent: no account matches this audience';
    } else if (totals.accepted === 0) {
      status = 'failed';
      failureReason = `Not sent: no message was accepted by a provider${commonest ? ` (${commonest})` : ''}`;
    } else if (processed >= total) {
      status = 'sent';
      failureReason = `${totals.accepted} accepted by a provider, ${totals.failed} refused, ${totals.notSent} not sent`;
    } else {
      status = 'approved';
      failureReason = `${processed} of ${total} recipients processed so far. Press "Send now" again to continue.`;
    }

    const now = new Date();
    await announcements.updateOne(
      { _id: oid },
      {
        $set: {
          status,
          statusReason: failureReason,
          statusChangedAt: now,
          statusChangedBy: check.admin.email || null,
          failureReason,
          lastAttemptAt: now,
          audienceCount: total,
          recipientsProcessed: processed,
          acceptedCount: totals.accepted,
          failedCount: totals.failed,
          notSentCount: totals.notSent,
          updatedAt: now,
          updatedBy: check.admin.email || null,
        },
      }
    );

    await logAudit({
      admin: check.admin,
      action: 'send_attempt',
      module: 'communications',
      entityType: 'announcements',
      entityId: String(announcement._id),
      entityLabel: announcement.title,
      before: { status: announcement.status },
      after: { status, failureReason, audienceCount: total, recipientsProcessed: processed, ...totals },
      request,
    });

    return ok({
      sent: status === 'sent',
      status,
      reason: failureReason,
      audience: total,
      processedThisRun: recipients.length,
      remaining: Math.max(0, total - processed),
      thisRun: { accepted: run.accepted, failed: run.failed, notSent: run.not_sent },
      totals,
    });
  } catch (error) {
    console.error('Announcement send failed:', error);
    return fail('Failed to send the announcement', 500);
  }
}
