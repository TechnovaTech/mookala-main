import crypto from 'crypto';
import type { Db } from 'mongodb';
import type { AdminIdentity } from '@/lib/permissions';
import { retryDueDeliveries } from '@/lib/notifications';
import { dispatchDuePushCampaigns } from '@/lib/push-campaigns';
import { DAY_MS, sweepExpired, todayStart } from '@/lib/resources/memberships.hooks';
import {
  SEND_ALL_CAP,
  SUBSCRIPTIONS,
  planNames,
  readReminderSettings,
  reminderState,
  sendReadiness,
  sendReminder,
} from '@/app/api/admin/memberships/_lib/data';
import { runAnnouncementBatch } from './announcements';

/**
 * The notification scheduler. Runs every 15 minutes from the host's cron
 * (GET /api/cron/notifications, see vercel.json) and on "Run now" by an
 * approver. Server only. One run:
 *
 *   1. sends approved announcements whose scheduled time has arrived, and
 *      continues announcements that are part way through ("sending"),
 *      emergencies first;
 *   2. sends push campaigns that are due (dispatchDuePushCampaigns in
 *      lib/push-campaigns.ts, owned by Marketing > Push Campaigns);
 *   3. retries failed deliveries whose provider error was temporary, with
 *      backoff, up to MAX_AUTO_ATTEMPTS attempts in all;
 *   4. sends due membership expiry reminders, only when automatic reminders
 *      are switched on (settings { type: 'memberships' }.reminderAutoSend),
 *      through the memberships module's own sendReminder().
 *
 * Vercel Hobby plan: cron jobs run at most once a day there, and a more
 * frequent schedule is refused at deployment. Every-15-minutes needs the Pro
 * plan, or an external scheduler calling the cron URL with the CRON_SECRET.
 */

export const SCHEDULER_RUNS = 'notificationSchedulerRuns';
const LOCKS = 'schedulerLocks';
const LOCK_ID = 'notifications';
const LOCK_MS = 5 * 60_000;
/** Leave time inside the host's 60-second limit to record the run. */
const RUN_BUDGET_MS = 45_000;

const SYSTEM: AdminIdentity = { email: 'scheduler', name: 'Notification scheduler' };

interface LockDoc {
  _id: string;
  until: Date | null;
  by?: string;
  at?: Date;
}

export interface SchedulerResult {
  skipped?: string;
  announcements: { due: number; runs: { id: string; title: string; ok: boolean; status?: string; error?: string; processed?: number; accepted?: number; failed?: number; notSent?: number }[] };
  pushCampaigns: { attempted: number; sent: number; failed: number } | { error: string };
  retries: { attempted: number; accepted: number; failed: number; notSent: number; skipped: number } | { error: string };
  membershipReminders:
    | { skipped: string }
    | { runId: string; due: number; attempted: number; accepted: number; failed: number; notSent: number; leftForNextRun: number }
    | { error: string };
}

export async function runNotificationScheduler(
  db: Db,
  options: { trigger: 'cron' | 'manual'; by: string; now?: Date }
): Promise<{ runId: string | null; result: SchedulerResult; startedAt: Date; finishedAt: Date }> {
  const startedAt = new Date();
  const now = options.now || startedAt;
  const deadline = startedAt.getTime() + RUN_BUDGET_MS;
  const empty: SchedulerResult = {
    announcements: { due: 0, runs: [] },
    pushCampaigns: { attempted: 0, sent: 0, failed: 0 },
    retries: { attempted: 0, accepted: 0, failed: 0, notSent: 0, skipped: 0 },
    membershipReminders: { skipped: 'not reached' },
  };

  // One run at a time: a second call while one is running does nothing.
  const locks = db.collection<LockDoc>(LOCKS);
  try {
    await locks.findOneAndUpdate(
      { _id: LOCK_ID, $or: [{ until: null }, { until: { $lt: startedAt } }] },
      { $set: { until: new Date(startedAt.getTime() + LOCK_MS), by: options.by, at: startedAt } },
      { upsert: true }
    );
  } catch (error: any) {
    if (error?.code === 11000) {
      return { runId: null, result: { ...empty, skipped: 'Another scheduler run is in progress' }, startedAt, finishedAt: new Date() };
    }
    throw error;
  }

  const result: SchedulerResult = { ...empty, announcements: { due: 0, runs: [] } };
  try {
    // 1. Announcements: due scheduled ones and ones part way through, emergencies first.
    try {
      const due = await db
        .collection('announcements')
        .find({
          approvedBy: { $nin: [null, ''] },
          $or: [{ status: 'scheduled', scheduledFor: { $lte: now } }, { status: 'sending' }],
        })
        .sort({ priority: 1, scheduledFor: 1, _id: 1 })
        .limit(20)
        .project({ title: 1 })
        .toArray();
      result.announcements.due = due.length;
      for (const item of due) {
        if (Date.now() > deadline) break;
        const run = await runAnnouncementBatch(db, item._id, { actor: SYSTEM, trigger: 'scheduler', deadline, now: new Date() });
        result.announcements.runs.push(
          run.ok
            ? {
                id: String(item._id),
                title: String(item.title || ''),
                ok: true,
                status: run.outcome.status,
                processed: run.outcome.processedThisRun,
                accepted: run.outcome.thisRun.accepted,
                failed: run.outcome.thisRun.failed,
                notSent: run.outcome.thisRun.notSent,
              }
            : { id: String(item._id), title: String(item.title || ''), ok: false, error: run.error }
        );
      }
    } catch (error: any) {
      console.error('Scheduler: announcements failed:', error);
      result.announcements.runs.push({ id: '', title: '', ok: false, error: error?.message || 'failed' });
    }

    // 2. Push campaigns.
    try {
      result.pushCampaigns = Date.now() > deadline ? { error: 'left for the next run (time limit)' } : await dispatchDuePushCampaigns(db, now);
    } catch (error: any) {
      console.error('Scheduler: push campaigns failed:', error);
      result.pushCampaigns = { error: error?.message || 'failed' };
    }

    // 3. Automatic retries of temporary provider errors.
    try {
      result.retries = await retryDueDeliveries(db, new Date(), { limit: 100, deadline });
    } catch (error: any) {
      console.error('Scheduler: retries failed:', error);
      result.retries = { error: error?.message || 'failed' };
    }

    // 4. Membership expiry reminders, when the membership settings switch them on.
    try {
      result.membershipReminders = await membershipReminders(db, deadline);
    } catch (error: any) {
      console.error('Scheduler: membership reminders failed:', error);
      result.membershipReminders = { error: error?.message || 'failed' };
    }
  } finally {
    await locks.updateOne({ _id: LOCK_ID }, { $set: { until: null } }).catch(() => undefined);
  }

  const finishedAt = new Date();
  const inserted = await db.collection(SCHEDULER_RUNS).insertOne({ trigger: options.trigger, by: options.by, startedAt, finishedAt, result });
  return { runId: String(inserted.insertedId), result, startedAt, finishedAt };
}

async function membershipReminders(db: Db, deadline: number): Promise<SchedulerResult['membershipReminders']> {
  // Lapsed subscriptions are marked expired first, so nobody is reminded about,
  // or counted as holding, a membership that has already ended.
  try {
    await sweepExpired(db, { admin: SYSTEM, via: 'scheduler' });
  } catch (error) {
    console.error('Membership expiry sweep failed in the scheduler:', error);
  }
  const doc = await db.collection('settings').findOne({ type: 'memberships' }, { projection: { reminderAutoSend: 1 } });
  if (doc?.reminderAutoSend !== true) return { skipped: 'Automatic expiry reminders are switched off' };

  const settings = await readReminderSettings(db);
  if (settings.reminderDays.length === 0) return { skipped: 'No reminder days are saved in the membership reminder settings' };
  const readiness = await sendReadiness(db, settings);
  if (!readiness.templateApproved) {
    return {
      skipped: readiness.template
        ? `The ${settings.channel} template "${settings.templateKey}" is not approved`
        : `No ${settings.channel} template with the key "${settings.templateKey}" exists`,
    };
  }
  // Nothing would be handed to a provider: do not fill the log with "not sent" entries every 15 minutes.
  if (readiness.channelBlocker) return { skipped: `Not sent: ${readiness.channelBlocker}` };

  const today = todayStart();
  const window = Math.max(1, ...settings.reminderDays);
  const rows = await db
    .collection(SUBSCRIPTIONS)
    .find({ status: 'active', expiresOn: { $gte: today, $lte: new Date(today.getTime() + window * DAY_MS) } })
    .sort({ expiresOn: 1 })
    .limit(500)
    .toArray();
  const names = await planNames(db, rows);
  const due = rows
    .map((row) => ({ row, plan: names.get(String(row.plan)) || row.planName || '', ...reminderState(row, settings, today) }))
    .filter((entry) => entry.reminderDue && !entry.attemptedToday);
  const batch = due.slice(0, SEND_ALL_CAP);
  const runId = crypto.randomBytes(6).toString('hex');

  const tally = { attempted: 0, accepted: 0, failed: 0, notSent: 0 };
  for (const entry of batch) {
    if (Date.now() > deadline) break;
    const sent = await sendReminder(db, entry.row, settings, entry.plan, SYSTEM, undefined, runId);
    tally.attempted += 1;
    if (sent.status === 'accepted') tally.accepted += 1;
    else if (sent.status === 'failed') tally.failed += 1;
    else tally.notSent += 1;
  }
  return { runId, due: due.length, ...tally, leftForNextRun: due.length - tally.attempted };
}

export async function recentSchedulerRuns(db: Db, limit = 10) {
  const runs = await db.collection(SCHEDULER_RUNS).find({}).sort({ startedAt: -1 }).limit(limit).toArray();
  return runs.map((run) => ({ ...run, _id: String(run._id) }));
}
