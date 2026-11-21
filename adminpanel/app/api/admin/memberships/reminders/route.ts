import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { diff, logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { isChannel } from '@/lib/notifications';
import { DAY_MS, effectiveStatus, sweepExpired, todayStart } from '@/lib/resources/memberships.hooks';
import {
  DEFAULT_TEMPLATE_KEY,
  MANUAL_CHANNELS,
  SEND_ALL_CAP,
  SUBSCRIPTIONS,
  TEMPLATE_VARIABLES,
  planNames,
  readReminderSettings,
  reminderState,
  sendReadiness,
  sendReminder, canSeeMemberContacts, withoutContacts } from '../_lib/data';

export const dynamic = 'force-dynamic';

const DEFAULT_WINDOW = 30;

/**
 * Expiry reminders.
 *
 *   GET   settings, whether a reminder can really be sent, and who is due
 *   PUT   save the settings (days before expiry, channel, template key, wording)
 *   POST  { action: 'send', subscriptionId }      send one reminder
 *         { action: 'send_due' }                  send to everyone due, at most SEND_ALL_CAP
 *         { action: 'record', subscriptionId, channel, note }   record a reminder made by hand
 *
 * Sending goes through sendNotification() with an approved template. What is
 * recorded against the subscription is the delivery log's own status:
 * "accepted" only when a provider took the message, otherwise "not_sent" or
 * "failed" with the reason. There is no scheduler: nothing is sent unless an
 * admin presses a button.
 */

async function dueList(db: any, windowDays: number, settings: Awaited<ReturnType<typeof readReminderSettings>>) {
  const today = todayStart();
  const until = new Date(today.getTime() + windowDays * DAY_MS);
  const rows = await db
    .collection(SUBSCRIPTIONS)
    .find({ status: 'active', expiresOn: { $gte: today, $lte: until } })
    .sort({ expiresOn: 1 })
    .limit(500)
    .toArray();
  const names = await planNames(db, rows);
  return rows.map((row: any) => ({ row, plan: names.get(String(row.plan)) || row.planName || '', ...reminderState(row, settings, today) }));
}

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'memberships:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    await sweepExpired(db, { admin: check.admin, request, via: 'on-read' });
    const settings = await readReminderSettings(db);

    const requested = parseInt(request.nextUrl.searchParams.get('days') || '', 10);
    const fallback = settings.reminderDays.length ? Math.max(...settings.reminderDays) : DEFAULT_WINDOW;
    const windowDays = Number.isInteger(requested) && requested >= 1 && requested <= 90 ? requested : Math.max(1, fallback);

    const [list, readiness] = await Promise.all([dueList(db, windowDays, settings), sendReadiness(db, settings)]);

    const subscriptions = list.map((entry: any) => ({
      _id: String(entry.row._id),
      memberName: entry.row.memberName || '',
      memberPhone: entry.row.memberPhone || '',
      memberEmail: entry.row.memberEmail || '',
      plan: entry.plan,
      expiresOn: entry.row.expiresOn,
      daysLeft: entry.daysLeft,
      autoRenew: Boolean(entry.row.autoRenew),
      reminderDue: entry.reminderDue,
      dueStep: entry.reminderDue ? entry.step : null,
      attemptedToday: entry.attemptedToday,
      lastReminderAt: entry.row.lastReminderAt || null,
      reminders: entry.entries.slice(-5).reverse(),
      reminderCount: entry.entries.length,
    }));

    return ok(contactsFor(check.admin, {
      settings,
      readiness,
      templateVariables: TEMPLATE_VARIABLES,
      sendAllCap: SEND_ALL_CAP,
      windowDays,
      subscriptions,
      canManage: can(check.admin, 'memberships:manage'),
    }));
  } catch (error) {
    console.error('Membership reminders failed:', error);
    return fail('Failed to load expiry reminders', 500);
  }
}

/** Saves the reminder settings. */
export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request, 'memberships:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    if (!Array.isArray(body.reminderDays)) return fail('Reminder days must be a list of numbers.');
    const days = Array.from(new Set(body.reminderDays.map((d: any) => (typeof d === 'number' ? d : parseInt(String(d), 10))))) as number[];
    if (days.length === 0) return fail('Enter at least one number of days before expiry.');
    if (days.length > 5) return fail('Use at most five reminder steps.');
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 90)) {
      return fail('Each reminder step must be a whole number of days between 0 and 90.');
    }

    const { db } = await connectToDatabase();
    const before = await readReminderSettings(db);

    const channel = body.channel === undefined ? before.channel : body.channel;
    if (!isChannel(channel)) return fail('Choose SMS, email, WhatsApp or push as the channel.');
    const templateKey = body.templateKey === undefined ? before.templateKey : asString(body.templateKey, 60) || DEFAULT_TEMPLATE_KEY;
    if (!/^[a-z0-9_]{2,60}$/.test(templateKey)) {
      return fail('The template key may only contain lower-case letters, numbers and underscores.');
    }
    const message = asString(body.reminderMessage, 1000);

    const next = { reminderDays: days.sort((a, b) => b - a), channel, templateKey, reminderMessage: message };

    await db.collection('settings').updateOne(
      { type: 'memberships' },
      {
        $set: {
          reminderDays: next.reminderDays,
          reminderChannel: channel,
          reminderTemplateKey: templateKey,
          reminderMessage: message,
          remindersUpdatedAt: new Date(),
          remindersUpdatedBy: check.admin.email || null,
        },
        $setOnInsert: { type: 'memberships', createdAt: new Date() },
      },
      { upsert: true }
    );

    const changes = diff(
      { reminderDays: before.reminderDays, channel: before.channel, templateKey: before.templateKey, reminderMessage: before.reminderMessage },
      next
    );
    if (Object.keys(changes.after).length > 0) {
      await logAudit({
        admin: check.admin,
        action: 'update',
        module: 'memberships',
        entityType: 'membership-reminder-settings',
        entityLabel: 'Expiry reminder settings',
        before: changes.before,
        after: changes.after,
        reason: asString(body.reason, 500) || null,
        request,
      });
    }

    const settings = await readReminderSettings(db);
    return ok(contactsFor(check.admin, { settings, readiness: await sendReadiness(db, settings) }));
  } catch (error) {
    console.error('Saving reminder settings failed:', error);
    return fail('Failed to save the reminder settings', 500);
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'memberships:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');
    const action = asString(body.action, 20) || 'record';
    if (!['record', 'send', 'send_due'].includes(action)) return fail('Unknown action');

    const { db } = await connectToDatabase();
    const collection = db.collection(SUBSCRIPTIONS);
    const settings = await readReminderSettings(db);

    if (action === 'send' || action === 'send_due') {
      const readiness = await sendReadiness(db, settings);
      if (!readiness.templateApproved) {
        return fail(
          readiness.template
            ? `The ${settings.channel} template "${settings.templateKey}" is ${readiness.template.status.replace(/_/g, ' ')}, not approved. Approve it under Communications, Templates before sending reminders.`
            : `No ${settings.channel} template with the key "${settings.templateKey}" exists. Create and approve it under Communications, Templates before sending reminders.`,
          409,
          { code: 'template_not_approved' }
        );
      }
    }

    if (action === 'send_due') {
      if (settings.reminderDays.length === 0) return fail('Save the reminder days in the settings first.', 409);
      const window = Math.max(1, ...settings.reminderDays);
      const list = await dueList(db, window, settings);
      const due = list.filter((entry: any) => entry.reminderDue);
      const eligible = due.filter((entry: any) => !entry.attemptedToday);
      const batch = eligible.slice(0, SEND_ALL_CAP);
      const runId = crypto.randomBytes(6).toString('hex');

      const tally = { accepted: 0, failed: 0, not_sent: 0 } as Record<string, number>;
      let firstError: string | null = null;
      for (const entry of batch) {
        const sent = await sendReminder(db, entry.row, settings, entry.plan, check.admin, request, runId);
        tally[sent.status] = (tally[sent.status] || 0) + 1;
        if (sent.error && !firstError) firstError = sent.error;
      }

      const result = {
        runId,
        due: due.length,
        attempted: batch.length,
        accepted: tally.accepted,
        failed: tally.failed,
        notSent: tally.not_sent,
        skippedAlreadyAttemptedToday: due.length - eligible.length,
        leftForNextRun: eligible.length - batch.length,
        cap: SEND_ALL_CAP,
        firstError,
      };
      await logAudit({
        admin: check.admin,
        action: 'reminder_send_all',
        module: 'memberships',
        entityType: 'membership-reminders',
        entityLabel: 'Send all due expiry reminders',
        after: result,
        meta: { channel: settings.channel, templateKey: settings.templateKey, subscriptionIds: batch.map((entry: any) => String(entry.row._id)) },
        request,
      });
      return ok(result);
    }

    const id = toObjectId(body.subscriptionId);
    if (!id) return fail('Invalid subscription id');
    const subscription = await collection.findOne({ _id: id });
    if (!subscription) return fail('Subscription not found', 404);
    if (effectiveStatus(subscription) !== 'active') {
      return fail('Expiry reminders are only for active subscriptions. This one is no longer active.', 409);
    }

    if (action === 'send') {
      const names = await planNames(db, [subscription]);
      const entry = await sendReminder(db, subscription, settings, names.get(String(subscription.plan)) || '', check.admin, request);
      return ok(contactsFor(check.admin, { reminder: entry }));
    }

    const channel = asString(body.channel, 20);
    if (!MANUAL_CHANNELS.includes(channel)) return fail('Choose how the reminder was made.');
    const note = asString(body.note, 500);
    const now = new Date();
    const entry = {
      at: now,
      by: check.admin.email || null,
      byName: check.admin.name || null,
      kind: 'manual',
      channel,
      status: 'manual',
      note: note || null,
      daysBeforeExpiry: subscription.expiresOn
        ? Math.max(0, Math.round((new Date(subscription.expiresOn).getTime() - todayStart().getTime()) / DAY_MS))
        : null,
    };

    await collection.updateOne(
      { _id: id },
      { $push: { reminders: entry } as any, $set: { lastReminderAt: now, updatedAt: now, updatedBy: check.admin.email || null } }
    );

    await logAudit({
      admin: check.admin,
      action: 'reminder_recorded',
      module: 'memberships',
      entityType: 'membership-subscriptions',
      entityId: String(id),
      entityLabel: subscription.memberName || null,
      after: { channel, daysBeforeExpiry: entry.daysBeforeExpiry, note: entry.note, madeByHand: true },
      request,
    });

    return ok(contactsFor(check.admin, { reminder: entry }));
  } catch (error) {
    console.error('Membership reminder action failed:', error);
    return fail('Failed to complete the reminder action', 500);
  }
}

/** Members' phone numbers and emails only for roles that may see them. */
function contactsFor<T>(admin: any, payload: T): T {
  return canSeeMemberContacts(admin) ? payload : withoutContacts(payload);
}
