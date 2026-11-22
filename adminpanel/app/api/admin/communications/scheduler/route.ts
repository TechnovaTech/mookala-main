import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { readReminderSettings, sendReadiness } from '@/app/api/admin/memberships/_lib/data';
import { recentSchedulerRuns, runNotificationScheduler } from '../_lib/scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 *   GET   what the scheduler did recently and how it is set up
 *   POST  run it now (approvers: communications:approve), audited
 *   PUT   { reminderAutoSend, reason } switch automatic membership expiry
 *         reminders on or off (memberships:manage), audited
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'communications:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const [runs, memberships, settings] = await Promise.all([
      recentSchedulerRuns(db, 10),
      db.collection('settings').findOne({ type: 'memberships' }, { projection: { reminderAutoSend: 1, reminderAutoSendChangedAt: 1, reminderAutoSendChangedBy: 1 } }),
      readReminderSettings(db),
    ]);
    const readiness = await sendReadiness(db, settings);
    return ok({
      runs,
      cronSecretConfigured: (process.env.CRON_SECRET || '').length >= 16,
      schedule: '*/15 * * * *',
      membershipReminders: {
        autoSend: memberships?.reminderAutoSend === true,
        changedAt: memberships?.reminderAutoSendChangedAt || null,
        changedBy: memberships?.reminderAutoSendChangedBy || null,
        reminderDays: settings.reminderDays,
        channel: settings.channel,
        templateKey: settings.templateKey,
        templateApproved: readiness.templateApproved,
        channelBlocker: readiness.channelBlocker,
      },
      canRun: can(check.admin, 'communications:approve'),
      canToggleReminders: can(check.admin, 'memberships:manage'),
    });
  } catch (error) {
    console.error('Load scheduler status failed:', error);
    return fail('Failed to load the scheduler status', 500);
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'communications:approve');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const run = await runNotificationScheduler(db, { trigger: 'manual', by: check.admin.email || 'admin' });
    await logAudit({
      admin: check.admin,
      action: 'scheduler_run',
      module: 'communications',
      entityType: 'notification-scheduler',
      entityLabel: 'Notification scheduler',
      after: run.result,
      meta: { runId: run.runId },
      request,
    });
    return ok({ runId: run.runId, startedAt: run.startedAt, finishedAt: run.finishedAt, ...run.result });
  } catch (error) {
    console.error('Manual scheduler run failed:', error);
    return fail('The scheduler run failed', 500);
  }
}

export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request, 'memberships:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || typeof body.reminderAutoSend !== 'boolean') return fail('Say whether automatic reminders are on (true) or off (false)');
    const reason = asString(body.reason, 500);
    if (reason.length < 5) return fail('A written reason (at least 5 characters) is required');

    const { db } = await connectToDatabase();
    const before = await db.collection('settings').findOne({ type: 'memberships' }, { projection: { reminderAutoSend: 1 } });
    const now = new Date();
    await db.collection('settings').updateOne(
      { type: 'memberships' },
      {
        $set: { reminderAutoSend: body.reminderAutoSend, reminderAutoSendChangedAt: now, reminderAutoSendChangedBy: check.admin.email || null },
        $setOnInsert: { type: 'memberships', createdAt: now },
      },
      { upsert: true }
    );
    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'memberships',
      entityType: 'membership-reminder-settings',
      entityLabel: 'Automatic expiry reminders',
      before: { reminderAutoSend: before?.reminderAutoSend === true },
      after: { reminderAutoSend: body.reminderAutoSend },
      reason,
      request,
    });
    return ok({ reminderAutoSend: body.reminderAutoSend });
  } catch (error) {
    console.error('Saving automatic reminders failed:', error);
    return fail('Failed to save the setting', 500);
  }
}
