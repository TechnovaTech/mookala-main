import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import type { Db, ObjectId } from 'mongodb';
import { logAudit } from '@/lib/audit';
import type { AdminIdentity } from '@/lib/permissions';
import {
  MAX_EMERGENCY_RECIPIENTS_PER_RUN,
  MAX_RECIPIENTS_PER_RUN,
  addressFor,
  announcementTemplatesProblem,
  countAudience,
  isChannel,
  loadRecipientBatch,
  logDelivery,
  resolveAudience,
  sendNotification,
  validTokensFor,
  type AudienceCursor,
  type Channel,
  type Recipient,
} from '@/lib/notifications';

/**
 * Sending an announcement, in batches. Used by "Send now"
 * (/api/admin/communications/announcements/[id]/send) and by the scheduler
 * (/api/cron/notifications). Server only.
 *
 *   approved / scheduled / failed  a run starts from the first recipient
 *   sending                        a run continues where the last one stopped
 *
 * One run handles at most MAX_RECIPIENTS_PER_RUN recipients (more for an
 * emergency) and stops early at the deadline, so a host time limit never cuts
 * a batch in half. A lock on the record keeps two runs (an admin and the
 * scheduler) from sending the same batch twice.
 */

export const SENDABLE = ['approved', 'scheduled', 'sending', 'failed'];
const LOCK_MS = 5 * 60_000;

export function audienceFiltersOf(record: Record<string, any>) {
  return {
    city: record.city || null,
    event: record.eventFilter || null,
    attendedOnly: record.attendedOnly === true,
    membership: record.membershipFilter || null,
  };
}

function defaultName(recipient: Recipient): string {
  if (recipient.name) return recipient.name;
  return recipient.type === 'user' ? 'Customer' : recipient.type === 'artist' ? 'Artist' : 'Organiser';
}

export interface BatchOutcome {
  status: string;
  reason: string;
  audience: number;
  processedThisRun: number;
  remaining: number;
  thisRun: { accepted: number; failed: number; notSent: number };
  totals: { accepted: number; failed: number; notSent: number; processed: number };
  done: boolean;
  stoppedAtDeadline: boolean;
}

export type BatchResult = { ok: true; outcome: BatchOutcome } | { ok: false; error: string; status: number };

export async function runAnnouncementBatch(
  db: Db,
  id: ObjectId,
  options: {
    actor: AdminIdentity;
    trigger: 'manual' | 'scheduler';
    request?: NextRequest;
    /** Stop handing out messages after this time (ms since epoch). */
    deadline?: number;
    now?: Date;
  }
): Promise<BatchResult> {
  const now = options.now || new Date();
  const announcements = db.collection('announcements');
  const announcement = await announcements.findOne({ _id: id });
  if (!announcement) return { ok: false, error: 'Announcement not found', status: 404 };

  if (announcement.status === 'sent') return { ok: false, error: 'This announcement has already been sent to its whole audience.', status: 409 };
  if (announcement.status === 'cancelled') return { ok: false, error: 'This announcement was cancelled.', status: 409 };
  if (!SENDABLE.includes(announcement.status) || !announcement.approvedBy) {
    return { ok: false, error: 'Only an approved announcement can be sent. Submit it for approval first.', status: 409 };
  }
  const emergency = announcement.priority === 'emergency';
  if (announcement.status === 'scheduled' && announcement.scheduledFor && new Date(announcement.scheduledFor) > now && !emergency) {
    return {
      ok: false,
      error: 'This announcement is scheduled for later and will be sent by the scheduler. To send it now, move it back to Draft and have it approved again.',
      status: 409,
    };
  }

  const channels = ((announcement.channels || []) as string[]).filter(isChannel) as Channel[];
  const templateProblem = await announcementTemplatesProblem(db, announcement);
  const parts = await resolveAudience(db, announcement.audience, null, audienceFiltersOf(announcement));
  const blocker = templateProblem || (typeof parts === 'string' ? parts : null);
  if (blocker || typeof parts === 'string') {
    // An admin is told; the scheduler records why it could not send so the screen shows it.
    if (options.trigger === 'scheduler') {
      await announcements.updateOne(
        { _id: id },
        {
          $set: {
            ...(announcement.status === 'sending' ? {} : { status: 'failed', statusChangedAt: now, statusChangedBy: 'scheduler' }),
            failureReason: `Not sent: ${blocker}`,
            statusReason: `Not sent: ${blocker}`,
            lastAttemptAt: now,
            lastRunBy: 'scheduler',
            updatedAt: now,
          },
        }
      );
    }
    return { ok: false, error: blocker || 'The audience could not be resolved', status: 409 };
  }

  // Claim the announcement for this run.
  const runId = crypto.randomBytes(6).toString('hex');
  const fresh = announcement.status !== 'sending';
  const claimed = await announcements.findOneAndUpdate(
    {
      _id: id,
      status: announcement.status,
      $or: [{ sendLockUntil: { $exists: false } }, { sendLockUntil: null }, { sendLockUntil: { $lt: now } }],
    },
    {
      $set: {
        status: 'sending',
        sendLockUntil: new Date(now.getTime() + LOCK_MS),
        sendLockId: runId,
        ...(fresh
          ? { recipientsProcessed: 0, sendCursor: null, acceptedCount: 0, failedCount: 0, notSentCount: 0, sendStartedAt: now }
          : {}),
      },
    },
    { returnDocument: 'after' }
  );
  const record = (claimed as any)?.value !== undefined ? (claimed as any).value : claimed;
  if (!record) return { ok: false, error: 'This announcement is already being sent by another run. Try again in a few minutes.', status: 409 };

  const { total } = await countAudience(db, parts);
  const cap = emergency ? MAX_EMERGENCY_RECIPIENTS_PER_RUN : MAX_RECIPIENTS_PER_RUN;
  const cursor: AudienceCursor | null = record.sendCursor || null;
  const batch = await loadRecipientBatch(db, parts, cursor, cap);

  // Device tokens for the push channel, per app.
  const tokens = new Map<string, string[]>();
  if (channels.includes('push') && batch.recipients.length) {
    for (const app of ['user', 'organizer'] as const) {
      const phones = batch.recipients.filter((r) => r.app === app).map((r) => r.phone);
      const found = await validTokensFor(db, phones, app);
      found.forEach((list, phone) => tokens.set(`${app}:${phone}`, list));
    }
  }

  const run = { accepted: 0, failed: 0, notSent: 0 };
  const errors = new Map<string, number>();
  const count = (status: string, error: string | null) => {
    if (status === 'accepted') run.accepted += 1;
    else if (status === 'failed') run.failed += 1;
    else run.notSent += 1;
    if (error) errors.set(error, (errors.get(error) || 0) + 1);
  };

  let handled = 0;
  let last: Recipient | null = null;
  let stoppedAtDeadline = false;
  for (const recipient of batch.recipients) {
    if (options.deadline && Date.now() > options.deadline) {
      stoppedAtDeadline = true;
      break;
    }
    const variables = { title: announcement.title, message: announcement.message, name: defaultName(recipient), city: recipient.city };
    const who = { type: recipient.type, id: recipient.id, name: recipient.name || null };
    for (const channel of channels) {
      const common = {
        channel,
        templateKey: announcement.templateKey,
        variables,
        campaignId: String(announcement._id),
        campaignType: 'announcement',
        bulk: true,
        emergency,
        requestedBy: options.actor.email || null,
        recipient: who,
      };
      if (channel === 'push') {
        const list = tokens.get(`${recipient.app}:${recipient.phone}`) || [];
        if (list.length === 0) {
          const error = `No registered ${recipient.app === 'user' ? 'customer app' : 'organiser app'} device for this account`;
          await logDelivery(db, {
            channel: 'push',
            to: recipient.phone ? `account ${recipient.phone}` : `account ${recipient.id}`,
            templateKey: announcement.templateKey,
            status: 'not_sent',
            error,
            campaignId: String(announcement._id),
            campaignType: 'announcement',
            bulk: true,
            emergency,
            requestedBy: options.actor.email || null,
            recipient: who,
          });
          count('not_sent', error);
          continue;
        }
        for (const token of list) {
          const result = await sendNotification(db, { ...common, to: token, data: { type: 'announcement' } });
          count(result.status, result.error);
        }
        continue;
      }
      const result = await sendNotification(db, { ...common, to: addressFor(recipient, channel) });
      count(result.status, result.error);
    }
    handled += 1;
    last = recipient;
  }

  const finishedBatch = handled === batch.recipients.length;
  const nextCursor: AudienceCursor = finishedBatch ? batch.cursor : { part: last ? last.part : cursor?.part || 0, lastId: last ? last.id : cursor?.lastId || null };
  const done = finishedBatch && batch.done;
  const processed = (record.recipientsProcessed || 0) + handled;
  const totals = {
    accepted: (record.acceptedCount || 0) + run.accepted,
    failed: (record.failedCount || 0) + run.failed,
    notSent: (record.notSentCount || 0) + run.notSent,
    processed,
  };
  const commonest = Array.from(errors.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  let status: string;
  let reason: string;
  if (total === 0 && done) {
    status = 'failed';
    reason = 'Not sent: no account matches this audience';
  } else if (done && totals.accepted === 0) {
    status = 'failed';
    reason = `Not sent: no message was accepted by a provider${commonest ? ` (${commonest})` : ''}`;
  } else if (done) {
    status = 'sent';
    reason = `${totals.accepted} accepted by a provider, ${totals.failed} refused, ${totals.notSent} not sent`;
  } else {
    status = 'sending';
    reason = `${processed} of ${total} recipients processed so far. The scheduler continues every 15 minutes, or press "Send now" again.`;
  }

  const finishedAt = new Date();
  const actorName = options.trigger === 'scheduler' ? 'scheduler' : options.actor.email || null;
  await announcements.updateOne(
    { _id: id, sendLockId: runId },
    {
      $set: {
        failureReason: reason,
        lastAttemptAt: finishedAt,
        lastRunBy: actorName,
        audienceCount: total,
        recipientsProcessed: processed,
        acceptedCount: totals.accepted,
        failedCount: totals.failed,
        notSentCount: totals.notSent,
        sendCursor: nextCursor,
        sendLockUntil: null,
        sendLockId: null,
        updatedAt: finishedAt,
        updatedBy: actorName,
      },
    }
  );
  // Cancelled while this batch ran: it stays cancelled.
  await announcements.updateOne(
    { _id: id, status: 'sending' },
    { $set: { status, statusReason: reason, statusChangedAt: finishedAt, statusChangedBy: actorName, ...(status === 'sent' ? { sentAt: finishedAt } : {}) } }
  );
  const after = await announcements.findOne({ _id: id }, { projection: { status: 1 } });

  await logAudit({
    admin: options.actor,
    action: 'send_attempt',
    module: 'communications',
    entityType: 'announcements',
    entityId: String(announcement._id),
    entityLabel: announcement.title,
    before: { status: announcement.status },
    after: { status: after?.status || status, reason, audienceCount: total, processedThisRun: handled, ...totals, thisRun: run },
    meta: { trigger: options.trigger, runId, emergency, stoppedAtDeadline },
    request: options.request,
  });

  return {
    ok: true,
    outcome: {
      status: after?.status || status,
      reason,
      audience: total,
      processedThisRun: handled,
      remaining: Math.max(0, total - processed),
      thisRun: run,
      totals,
      done,
      stoppedAtDeadline,
    },
  };
}
