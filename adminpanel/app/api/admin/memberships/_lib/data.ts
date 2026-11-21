import type { Db, ObjectId } from 'mongodb';
import { can } from '@/lib/permissions';
import type { NextRequest } from 'next/server';
import { toObjectId } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { roundMoney } from '@/lib/ledger';
import type { AdminIdentity } from '@/lib/permissions';
import { findTemplate, getChannelConfig, isChannel, messageBlocker, sendNotification, type Channel } from '@/lib/notifications';
import { DAY_MS, daysUntil, effectiveStatus, todayStart } from '@/lib/resources/memberships.hooks';

/** Server-only helpers shared by the membership API routes. */

export const SUBSCRIPTIONS = 'membershipSubscriptions';
export const PAYMENTS = 'membershipPayments';
export const PLANS = 'membershipPlans';

export function amountOf(value: unknown): number {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(amount) ? amount : 0;
}

/** Current plan names for the plan ids found on the given records. */
export async function planNames(db: Db, rows: any[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(rows.map((r) => String(r.plan || '')))).map((id) => toObjectId(id)).filter(Boolean) as ObjectId[];
  if (ids.length === 0) return new Map();
  const plans = await db.collection(PLANS).find({ _id: { $in: ids } }).project({ name: 1 }).toArray();
  return new Map(plans.map((p) => [String(p._id), String(p.name || '')]));
}

/** A subscription as the screens show it: with the plan name and the status it really has today. */
export function viewSubscription(row: any, names: Map<string, string>, today: Date = todayStart()) {
  return {
    _id: String(row._id),
    memberName: row.memberName || '',
    memberPhone: row.memberPhone || '',
    memberEmail: row.memberEmail || '',
    planId: row.plan ? String(row.plan) : '',
    plan: names.get(String(row.plan)) || row.planName || '',
    planPrice: row.planPrice ?? null,
    planBillingPeriod: row.planBillingPeriod || '',
    startedOn: row.startedOn || null,
    expiresOn: row.expiresOn || null,
    daysLeft: daysUntil(row.expiresOn, today),
    autoRenew: Boolean(row.autoRenew),
    storedStatus: row.status || 'active',
    status: effectiveStatus(row, today),
    statusReason: row.statusReason || null,
    statusChangedAt: row.statusChangedAt || null,
    lastPaymentReference: row.lastPaymentReference || null,
    lastPaymentAt: row.lastPaymentAt || null,
    lastPaymentAmount: row.lastPaymentAmount ?? null,
    lastFailedPaymentAt: row.lastFailedPaymentAt || null,
    cancelReason: row.cancelReason || null,
    cancelledAt: row.cancelledAt || null,
    cancelledBy: row.cancelledBy || null,
    reinstatedAt: row.reinstatedAt || null,
    lastReminderAt: row.lastReminderAt || null,
  };
}

/* ------------------------------------------------------------------ */
/* Revenue                                                             */
/* ------------------------------------------------------------------ */

export interface RevenueFigures {
  /** From the payment records on the Membership Payments screen. */
  documents: { payments: number; gross: number; refundCount: number; refunds: number; net: number };
  /** From the finance ledger (`transactions`, service "membership"), which the dashboard and Finance read. */
  ledger: { payments: number; gross: number; refundCount: number; refunds: number; net: number };
  /**
   * Membership payment entries in the ledger that were not written for a
   * payment record of this module (for example an entry made directly in
   * Finance). They are part of the ledger figure and explain a difference.
   */
  ledgerOther: { payments: number; gross: number };
  /** Paid or refunded payment records in the range that have no ledger entry. */
  missingFromLedger: number;
  matches: boolean;
}

/**
 * Membership revenue two ways for the same period: from the payment records
 * and from the ledger. The period is applied to the moment the payment (or the
 * refund) was entered in the ledger, which is the date the dashboard and the
 * finance screens use. `range` null means all dates.
 */
export async function revenueFigures(db: Db, range: { start: Date; end: Date } | null): Promise<RevenueFigures> {
  const between = range ? { $gte: range.start, $lt: range.end } : null;
  // Only records that reached the ledger carry a ledger date; the rest are reported as missing.
  const paidFilter: Record<string, any> = { status: { $in: ['paid', 'refunded'] }, paidRecordedAt: between || { $type: 'date' } };
  const refundFilter: Record<string, any> = { status: 'refunded', refundRecordedAt: between || { $type: 'date' } };
  const ledgerFilter: Record<string, any> = { service: 'membership', status: 'success', type: { $in: ['payment', 'refund'] } };
  if (between) ledgerFilter.createdAt = between;

  const [paid, refunded, ledgerRows, missing] = await Promise.all([
    db.collection(PAYMENTS).find(paidFilter).project({ amount: 1 }).toArray(),
    db.collection(PAYMENTS).find(refundFilter).project({ amount: 1 }).toArray(),
    db
      .collection('transactions')
      .aggregate([
        { $match: ledgerFilter },
        {
          $group: {
            _id: {
              type: '$type',
              own: { $eq: [{ $indexOfCP: [{ $convert: { input: '$meta.recordKey', to: 'string', onError: '', onNull: '' } }, 'membership-payment:'] }, 0] },
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    // Records from before payments were written to the ledger carry no ledger date at all.
    db.collection(PAYMENTS).countDocuments({
      status: { $in: ['paid', 'refunded'] },
      $or: [{ ledgerReference: null }, { ledgerReference: { $exists: false } }],
      ...(range ? { createdAt: between } : {}),
    }),
  ]);

  const sum = (rows: any[]) => roundMoney(rows.reduce((total, row) => total + amountOf(row.amount), 0));
  const ledgerOf = (type: string, own?: boolean) => {
    const rows = ledgerRows.filter((row) => row._id.type === type && (own === undefined || row._id.own === own));
    return { total: rows.reduce((t, row) => t + row.total, 0), count: rows.reduce((t, row) => t + row.count, 0) };
  };

  const documents = { payments: paid.length, gross: sum(paid), refundCount: refunded.length, refunds: sum(refunded), net: 0 };
  documents.net = roundMoney(documents.gross - documents.refunds);
  const ledger = {
    payments: ledgerOf('payment').count,
    gross: roundMoney(ledgerOf('payment').total),
    refundCount: ledgerOf('refund').count,
    refunds: roundMoney(ledgerOf('refund').total),
    net: 0,
  };
  ledger.net = roundMoney(ledger.gross - ledger.refunds);

  return {
    documents,
    ledger,
    ledgerOther: { payments: ledgerOf('payment', false).count, gross: roundMoney(ledgerOf('payment', false).total) },
    missingFromLedger: missing,
    matches: documents.gross === ledger.gross && documents.refunds === ledger.refunds,
  };
}

/* ------------------------------------------------------------------ */
/* Expiry reminders                                                    */
/* ------------------------------------------------------------------ */

export const DEFAULT_TEMPLATE_KEY = 'membership_expiry';
export const MANUAL_CHANNELS = ['call', 'whatsapp', 'sms', 'email', 'other'];
/** Most reminders one "Send all due" run will attempt. */
export const SEND_ALL_CAP = 50;
/** The values a reminder template receives. */
export const TEMPLATE_VARIABLES = ['name', 'plan', 'expiryDate', 'daysLeft'];

export interface ReminderSettings {
  reminderDays: number[];
  channel: Channel;
  templateKey: string;
  /** Wording for reminders the team makes by phone or sends by hand. */
  reminderMessage: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export async function readReminderSettings(db: Db): Promise<ReminderSettings> {
  const doc = await db.collection('settings').findOne({ type: 'memberships' });
  const days: number[] = Array.isArray(doc?.reminderDays)
    ? doc.reminderDays.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 90)
    : [];
  return {
    reminderDays: days.sort((a, b) => b - a),
    channel: isChannel(doc?.reminderChannel) ? doc.reminderChannel : 'sms',
    templateKey: typeof doc?.reminderTemplateKey === 'string' && doc.reminderTemplateKey ? doc.reminderTemplateKey : DEFAULT_TEMPLATE_KEY,
    reminderMessage: typeof doc?.reminderMessage === 'string' ? doc.reminderMessage : '',
    updatedAt: doc?.remindersUpdatedAt || null,
    updatedBy: doc?.remindersUpdatedBy || null,
  };
}

export interface SendReadiness {
  channel: Channel;
  templateKey: string;
  /** null when no template has this key on this channel. */
  template: { id: string; name: string; status: string } | null;
  templateApproved: boolean;
  /** Why the channel cannot hand a message to a provider right now, or null when it can. */
  channelBlocker: string | null;
}

/** Whether a reminder could really be sent with the saved settings, and if not, why. */
export async function sendReadiness(db: Db, settings: ReminderSettings): Promise<SendReadiness> {
  const [template, config] = await Promise.all([
    findTemplate(db, settings.templateKey, settings.channel),
    getChannelConfig(db, settings.channel),
  ]);
  return {
    channel: settings.channel,
    templateKey: settings.templateKey,
    template: template ? { id: String(template._id), name: String(template.name || ''), status: String(template.status || 'draft') } : null,
    templateApproved: template?.status === 'approved',
    channelBlocker: messageBlocker(config),
  };
}

/** A reminder counts as made when a provider accepted it or the team recorded one made by hand. */
function counts(entry: any): boolean {
  return entry?.kind === 'manual' || entry?.status === 'accepted' || (!entry?.kind && !entry?.status);
}

/** Which configured reminder step a subscription has reached, and whether it still needs a reminder. */
export function reminderState(subscription: any, settings: ReminderSettings, today: Date = todayStart()) {
  const expires = new Date(subscription.expiresOn).getTime();
  const daysLeft = Math.max(0, Math.round((expires - today.getTime()) / DAY_MS));
  const entries: any[] = Array.isArray(subscription.reminders) ? subscription.reminders : [];
  const reached = settings.reminderDays.filter((d) => daysLeft <= d);
  const step = reached.length ? Math.min(...reached) : null;
  const stepStart = step === null ? null : expires - step * DAY_MS;
  const done = stepStart !== null && entries.some((entry) => counts(entry) && new Date(entry.at).getTime() >= stepStart);
  // The day in India started 5.5 hours before midnight UTC of the same calendar day.
  const startOfDay = today.getTime() - 5.5 * 60 * 60 * 1000;
  const attemptedToday = entries.some((entry) => entry?.kind === 'sent' && new Date(entry.at).getTime() >= startOfDay);
  return { daysLeft, step, reminderDue: step !== null && !done, attemptedToday, entries };
}

function longDate(value: any): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Sends one expiry reminder through the notification system and records the
 * outcome on the subscription. The outcome is whatever the delivery log says:
 * "accepted" only when a provider took the message.
 */
export async function sendReminder(
  db: Db,
  subscription: any,
  settings: ReminderSettings,
  planName: string,
  admin: AdminIdentity,
  request?: NextRequest,
  runId?: string
) {
  const now = new Date();
  const daysLeft = Math.max(0, daysUntil(subscription.expiresOn) ?? 0);
  const to = settings.channel === 'email' ? String(subscription.memberEmail || '') : String(subscription.memberPhone || '');

  const result = await sendNotification(db, {
    channel: settings.channel,
    to,
    templateKey: settings.templateKey,
    variables: {
      name: subscription.memberName || 'Member',
      plan: planName || subscription.planName || 'membership',
      expiryDate: longDate(subscription.expiresOn),
      daysLeft: String(daysLeft),
    },
    // Reminders go to many members, so only an approved template may be used.
    bulk: true,
    requestedBy: admin.email || null,
  });

  const entry = {
    at: now,
    by: admin.email || null,
    byName: admin.name || null,
    kind: 'sent',
    channel: settings.channel,
    templateKey: settings.templateKey,
    status: result.status,
    error: result.error,
    logId: result.logId,
    note: null,
    daysBeforeExpiry: daysLeft,
    runId: runId || null,
  };

  await db.collection(SUBSCRIPTIONS).updateOne(
    { _id: subscription._id },
    {
      $push: { reminders: entry } as any,
      $set: { lastReminderAttemptAt: now, ...(result.status === 'accepted' ? { lastReminderAt: now } : {}), updatedAt: now },
    }
  );

  await logAudit({
    admin,
    action: 'reminder_send',
    module: 'memberships',
    entityType: 'membership-subscriptions',
    entityId: String(subscription._id),
    entityLabel: subscription.memberName || null,
    after: { channel: entry.channel, templateKey: entry.templateKey, deliveryStatus: entry.status, error: entry.error, daysBeforeExpiry: daysLeft },
    meta: { deliveryLogId: result.logId, runId: runId || null },
    request,
  });

  return entry;
}

/**
 * Payment records made before the ledger link was stored on them: copies the
 * ledger reference and ledger date onto the record, from the ledger entry that
 * was written for it. Changes nothing else and writes no money.
 */
export async function linkLedgerEntries(db: Db): Promise<number> {
  const unlinked = await db
    .collection(PAYMENTS)
    .find({
      $or: [
        { status: { $in: ['paid', 'refunded'] }, paidRecordedAt: { $exists: false } },
        { status: 'refunded', refundRecordedAt: { $exists: false } },
      ],
    })
    .project({ status: 1, paidRecordedAt: 1 })
    .limit(500)
    .toArray();
  if (unlinked.length === 0) return 0;

  const keys = unlinked.map((p) => `membership-payment:${p._id}`);
  const entries = await db
    .collection('transactions')
    .find({ 'meta.recordKey': { $in: keys }, type: { $in: ['payment', 'refund'] } })
    .project({ type: 1, reference: 1, createdAt: 1, 'meta.recordKey': 1 })
    .toArray();

  let linked = 0;
  for (const payment of unlinked) {
    const key = `membership-payment:${payment._id}`;
    const paid = entries.find((e) => e.meta?.recordKey === key && e.type === 'payment');
    const refund = entries.find((e) => e.meta?.recordKey === key && e.type === 'refund');
    const set: Record<string, any> = {};
    if (paid && !payment.paidRecordedAt) Object.assign(set, { ledgerReference: paid.reference, paidRecordedAt: paid.createdAt });
    if (refund && payment.status === 'refunded') Object.assign(set, { refundLedgerReference: refund.reference, refundRecordedAt: refund.createdAt });
    if (Object.keys(set).length === 0) continue;
    await db.collection(PAYMENTS).updateOne({ _id: payment._id }, { $set: set });
    linked += 1;
  }
  return linked;
}

/* ------------------------------------------------------------------ */
/* Contact details by role                                             */
/* ------------------------------------------------------------------ */

const CONTACT_KEYS = new Set(['memberPhone', 'memberEmail', 'customerPhone', 'phone', 'email', 'to']);

/**
 * Members' phone numbers and emails are personal data. A role that may read
 * memberships but has neither the users nor the finance module (Marketing)
 * gets the screens without them, matching the generic membership lists.
 */
export function canSeeMemberContacts(admin: any): boolean {
  return can(admin, 'users:view') || can(admin, 'finance:view');
}

export function withoutContacts<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutContacts(item)) as any;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, any> = {};
    for (const [key, item] of Object.entries(value as Record<string, any>)) {
      out[key] = CONTACT_KEYS.has(key) && typeof item === 'string' && item ? '' : withoutContacts(item);
    }
    if (Object.keys(out).some((key) => CONTACT_KEYS.has(key))) out.contactHidden = true;
    return out as T;
  }
  return value;
}
