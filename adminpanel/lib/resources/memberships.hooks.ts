/**
 * Server-side rules for the membership resources, and the helpers the
 * membership API routes share (dates, expiry, plan snapshots).
 *
 * How the three records fit together:
 *   plan          what is on offer. Its price can change; a subscription keeps
 *                 the price it was taken at (planPrice) and every payment keeps
 *                 its own amount and the plan price on the day (planPrice).
 *   subscription  one member holding one plan, valid through "Expires on".
 *   payment       a paid payment starts or renews its subscription (expiry
 *                 moves to the end of the paid period), a failed payment marks
 *                 the subscription "payment_failed" without extending it, and
 *                 a refund of the latest payment takes the paid period back.
 *
 * Dates entered as a calendar day are stored as midnight UTC of that day.
 * "Today" is the calendar day in India (Asia/Kolkata).
 */
import type { Db } from 'mongodb';
import type { NextRequest } from 'next/server';
import { registerHooks } from '../resource-hooks';
import { toObjectId } from '../http';
import { logAudit } from '../audit';
import type { AdminIdentity } from '../permissions';

export const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const MEMBERSHIP_TIMEZONE = 'Asia/Kolkata';

/** Today's calendar day in India, YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight UTC of today's Indian calendar day: comparable with stored calendar dates. */
export function todayStart(now: Date = new Date()): Date {
  return new Date(istToday(now) + 'T00:00:00.000Z');
}

function time(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = new Date(value as any).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Whole days from today until the date (negative once it has passed). */
export function daysUntil(value: unknown, today: Date = todayStart()): number | null {
  const ms = time(value);
  return ms === null ? null : Math.round((ms - today.getTime()) / DAY_MS);
}

/**
 * The status a subscription really has right now. A subscription is valid
 * through its expiry date, so a stored "active" with an expiry date before
 * today is expired, whether or not anything has rewritten the record yet.
 */
export function effectiveStatus(subscription: any, today: Date = todayStart()): string {
  const stored = String(subscription?.status || 'active');
  const expires = time(subscription?.expiresOn);
  if (stored === 'active' && expires !== null && expires < today.getTime()) return 'expired';
  return stored;
}

/** The last day of a billing period that starts on `from`. */
export function periodEnd(from: Date, billingPeriod: string): Date {
  const months = billingPeriod === 'yearly' ? 12 : billingPeriod === 'quarterly' ? 3 : 1;
  const end = new Date(from.getTime());
  end.setUTCMonth(end.getUTCMonth() + months);
  return new Date(end.getTime() - DAY_MS);
}

async function findById(db: Db, collection: string, id: unknown) {
  const oid = toObjectId(typeof id === 'string' ? id : String(id ?? ''));
  return oid ? db.collection(collection).findOne({ _id: oid }) : null;
}

function periodProblem(start: unknown, end: unknown, message: string): string | null {
  const a = time(start);
  const b = time(end);
  if (a === null || b === null) return null;
  return b > a ? null : message;
}

function same(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return true;
  if (a instanceof Date || b instanceof Date) return time(a) === time(b);
  return String(a) === String(b);
}

function planSnapshot(plan: any) {
  return {
    planName: plan.name || '',
    planPrice: Number(plan.price) || 0,
    planBillingPeriod: plan.billingPeriod || '',
    planAudience: plan.audience || '',
  };
}

/** Phone spellings one member may have been saved under. */
export function phoneVariants(phone: string): string[] {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return Array.from(new Set([phone, local, '91' + local, '+91' + local, '0' + local]));
}

/**
 * Stores "expired" on every subscription that is still marked active after its
 * expiry date. It runs when an admin presses "Update expired"
 * (`via: 'update-expired'`), whenever a membership screen is opened
 * (`via: 'on-read'`), and from the notifications scheduler. Each change is written to the activity log.
 */
export async function sweepExpired(
  db: Db,
  options: { admin: AdminIdentity | null; request?: NextRequest; via: 'update-expired' | 'on-read' | 'scheduler' }
): Promise<{ updated: number; remaining: number }> {
  const collection = db.collection('membershipSubscriptions');
  const today = todayStart();
  const now = new Date();
  const filter = { status: 'active', expiresOn: { $lt: today } };
  const manual = options.via === 'update-expired';
  const reason = manual ? 'Expiry date passed' : 'Expiry date passed (applied when a membership screen was opened)';

  const due = await collection.find(filter).project({ memberName: 1, expiresOn: 1 }).limit(2000).toArray();
  let updated = 0;
  for (const subscription of due) {
    // The status is re-checked in the filter in case it changed since the read.
    const result = await collection.updateOne(
      { _id: subscription._id, ...filter },
      {
        $set: {
          status: 'expired',
          statusReason: reason,
          statusChangedAt: now,
          statusChangedBy: manual ? options.admin?.email || null : 'system',
          expiredAt: now,
          updatedAt: now,
        },
      }
    );
    if (result.modifiedCount !== 1) continue;
    updated += 1;
    await logAudit({
      // Opening a screen is not the admin's decision, so that case is logged as the system's.
      admin: manual ? options.admin : null,
      action: 'status_change',
      module: 'memberships',
      entityType: 'membership-subscriptions',
      entityId: String(subscription._id),
      entityLabel: subscription.memberName || null,
      before: { status: 'active' },
      after: { status: 'expired' },
      reason,
      meta: { via: options.via, expiresOn: subscription.expiresOn, triggeredBy: options.admin?.email || null },
      request: options.request,
    });
  }

  const remaining = await collection.countDocuments(filter);
  return { updated, remaining };
}

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

registerHooks('membership-plans', {
  async beforeCreate({ db, doc }) {
    const duplicate = await db.collection('membershipPlans').findOne({
      name: doc.name,
      audience: doc.audience,
      billingPeriod: doc.billingPeriod,
      status: 'active',
    });
    if (duplicate) return 'An active plan with this name, audience and billing period already exists.';
  },

  beforeUpdate({ existing, changes, reason }) {
    if ('price' in changes && Number(changes.price) !== Number(existing.price) && !reason) {
      return 'A reason is required to change the price. Existing subscriptions and past payments keep the price they were taken at.';
    }
  },

  beforeStatusChange({ to, admin }) {
    if (to === 'retired') return { retiredAt: new Date(), retiredBy: admin.email || null };
  },

  async beforeDelete({ db, existing }) {
    const id = String(existing._id);
    const [subscriptions, payments] = await Promise.all([
      db.collection('membershipSubscriptions').countDocuments({ plan: id }),
      db.collection('membershipPayments').countDocuments({ plan: id }),
    ]);
    if (subscriptions > 0 || payments > 0) {
      return `This plan is used by ${subscriptions} subscription${subscriptions === 1 ? '' : 's'} and ${payments} payment record${payments === 1 ? '' : 's'}, so it cannot be deleted. Retire it instead: a retired plan cannot be chosen for new subscriptions and the history stays intact.`;
    }
  },
});

/* ------------------------------------------------------------------ */
/* Subscriptions                                                       */
/* ------------------------------------------------------------------ */

const OPEN_STATUSES = ['active', 'payment_failed', 'paused'];

registerHooks('membership-subscriptions', {
  async beforeCreate({ db, doc }) {
    const problem = periodProblem(doc.startedOn, doc.expiresOn, 'The expiry date must be after the start date.');
    if (problem) return problem;

    const plan = await findById(db, 'membershipPlans', doc.plan);
    if (!plan) return 'The selected plan does not exist.';
    if (plan.status === 'retired') return 'This plan is retired and cannot be used for a new subscription.';

    const open = await db.collection('membershipSubscriptions').findOne({
      memberPhone: { $in: phoneVariants(doc.memberPhone) },
      plan: String(plan._id),
      status: { $in: OPEN_STATUSES },
    });
    if (open) return 'This phone number already has an open subscription to this plan. Renew that one by recording a payment for it.';

    Object.assign(doc, planSnapshot(plan));
    // A subscription entered after its expiry date has already lapsed.
    if (effectiveStatus(doc) === 'expired') doc.status = 'expired';
  },

  async beforeUpdate({ db, existing, changes, reason }) {
    const problem = periodProblem(
      changes.startedOn ?? existing.startedOn,
      changes.expiresOn ?? existing.expiresOn,
      'The expiry date must be after the start date.'
    );
    if (problem) return problem;

    if ('plan' in changes && !same(changes.plan, existing.plan)) {
      const plan = await findById(db, 'membershipPlans', changes.plan);
      if (!plan) return 'The selected plan does not exist.';
      if (plan.status === 'retired') return 'This plan is retired and cannot be chosen.';
      if (!reason) return 'A reason is required to move a subscription to another plan.';
      Object.assign(changes, planSnapshot(plan));
    }

    if ('expiresOn' in changes && !same(changes.expiresOn, existing.expiresOn)) {
      if (!reason) {
        return 'A reason is required to change the expiry date by hand. To renew, record a payment for this subscription instead.';
      }
      // The stored status follows the new date.
      const next = effectiveStatus({ status: existing.status, expiresOn: changes.expiresOn });
      if (existing.status === 'active' && next === 'expired') changes.status = 'expired';
      if (existing.status === 'expired' && (time(changes.expiresOn) || 0) >= todayStart().getTime()) changes.status = 'active';
    }
  },

  beforeStatusChange({ existing, from, to, admin, reason }) {
    const now = new Date();
    const expired = (time(existing.expiresOn) ?? Infinity) < todayStart().getTime();

    if (from === 'cancelled') {
      if (to !== 'active') return 'A cancelled subscription can only be reinstated (set to Active).';
      if (!reason) return 'A reason is required to reinstate a cancelled subscription.';
      const extra: Record<string, any> = { reinstatedAt: now, reinstatedBy: admin.email || null, reinstateReason: reason };
      // Reinstated after its paid period ended: it comes back as expired, ready for a renewal payment.
      if (expired) extra.__status = 'expired';
      return extra;
    }

    if (to === 'active' && expired) {
      return 'The expiry date has passed. Record a payment for this subscription to renew it, or edit the expiry date with a reason.';
    }
    if (to === 'expired' && !expired) {
      return 'The expiry date has not passed yet. Cancel the subscription instead, or edit the expiry date with a reason.';
    }
    if (to === 'cancelled') return { cancelledAt: now, cancelledBy: admin.email || null, cancelReason: reason };
    if (to === 'paused') return { pausedAt: now, pausedBy: admin.email || null };
  },

  async beforeDelete({ db, existing }) {
    const payments = await db.collection('membershipPayments').countDocuments({ subscription: String(existing._id) });
    if (payments > 0) {
      return `This subscription has ${payments} payment record${payments === 1 ? '' : 's'}, so it cannot be deleted. Cancel it instead.`;
    }
  },
});

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

/** Fields that describe money already written to the ledger. */
const LOCKED_AFTER_PAID = ['subscription', 'plan', 'amount', 'paidOn', 'periodFrom', 'periodTo'];

async function writeLedger(db: Db, item: any, status: string, adminEmail: string | null) {
  const { recordManualPayment, recordManualRefund } = await import('../recorded-payments');
  const key = `membership-payment:${item._id}`;
  if (status === 'paid') {
    return recordManualPayment(db, {
      key,
      service: 'membership',
      amount: Number(item.amount) || 0,
      payeeType: 'platform',
      customerPhone: item.memberPhone || null,
      description: `Membership payment: ${item.memberName || 'member'}${item.planName ? ` (${item.planName})` : ''}`,
      createdBy: adminEmail,
    });
  }
  if (status === 'refunded') {
    return recordManualRefund(db, key, `Membership payment refunded: ${item.memberName || 'member'}`, adminEmail);
  }
  return null;
}

registerHooks('membership-payments', {
  async beforeCreate({ db, doc }) {
    const subscription = await findById(db, 'membershipSubscriptions', doc.subscription);
    if (!subscription) return 'The selected subscription does not exist.';
    if (subscription.status === 'cancelled') {
      return 'This subscription is cancelled. Reinstate it first (Renewals & Cancellations), then record the payment.';
    }

    const plan = await findById(db, 'membershipPlans', doc.plan || subscription.plan);
    if (doc.plan && !plan) return 'The selected plan does not exist.';
    const changingPlan = Boolean(doc.plan) && String(doc.plan) !== String(subscription.plan);
    if (changingPlan && plan?.status === 'retired') return 'This plan is retired and cannot be chosen.';

    const today = todayStart();
    if ((time(doc.paidOn) ?? 0) > today.getTime() + DAY_MS - 1) return 'The payment date cannot be in the future.';

    const failed = doc.recordAs === 'failed';
    // "Record as" picks the first status, so a failed renewal is never stored as paid.
    doc.status = failed ? 'failed' : 'paid';
    delete doc.recordAs;

    doc.subscription = String(subscription._id);
    doc.plan = plan ? String(plan._id) : subscription.plan || null;
    doc.memberName = subscription.memberName || '';
    doc.memberPhone = subscription.memberPhone || '';
    // The plan as it stood on the day: later changes to the plan do not touch this record.
    doc.planName = plan?.name || subscription.planName || '';
    doc.planPrice = plan ? Number(plan.price) || 0 : subscription.planPrice ?? null;

    if (Boolean(doc.periodFrom) !== Boolean(doc.periodTo)) {
      return 'Enter both the period start and the period end, or leave both empty.';
    }
    const problem = periodProblem(doc.periodFrom, doc.periodTo, 'The period end must be after the period start.');
    if (problem) return problem;

    if (failed) return;

    if (!(Number(doc.amount) > 0)) return 'Enter the amount that was received. For a payment that did not go through, choose "Failed".';

    const earlierPaid = await db
      .collection('membershipPayments')
      .countDocuments({ subscription: doc.subscription, status: { $in: ['paid', 'refunded'] } });
    const expires = time(subscription.expiresOn);
    const current = expires !== null && expires >= today.getTime();
    // The first payment of a subscription that is still running starts it. Any
    // later payment, and a payment for one that has already lapsed, renews it.
    doc.kind = earlierPaid === 0 && current ? 'start' : 'renewal';

    if (!doc.periodFrom) {
      if (doc.kind === 'start' && subscription.startedOn && current) {
        // The first payment pays for the period the subscription was entered with.
        doc.periodFrom = new Date(subscription.startedOn);
        doc.periodTo = new Date(expires as number);
      } else {
        // Otherwise the paid period carries on from the day after the current expiry, or starts today when that has passed.
        const from = current ? new Date((expires as number) + DAY_MS) : today;
        doc.periodFrom = from;
        doc.periodTo = periodEnd(from, plan?.billingPeriod || subscription.planBillingPeriod || 'monthly');
      }
      doc.periodFilledBy = 'system';
    }
  },

  async afterCreate({ db, item, admin }) {
    const subscriptions = db.collection('membershipSubscriptions');
    const payments = db.collection('membershipPayments');
    const subscription = await findById(db, 'membershipSubscriptions', item.subscription);
    if (!subscription) return;

    const now = new Date();
    const today = todayStart().getTime();
    const email = admin.email || null;
    const before = { status: subscription.status, expiresOn: subscription.expiresOn || null };

    if (item.status === 'failed') {
      await payments.updateOne({ _id: item._id }, { $set: { effect: { previousStatus: subscription.status, extended: false } } });
      if (!['active', 'expired'].includes(subscription.status)) return;
      const set = {
        status: 'payment_failed',
        statusReason: 'A payment for this subscription failed',
        statusChangedAt: now,
        statusChangedBy: email,
        lastFailedPaymentId: String(item._id),
        lastFailedPaymentAt: item.paidOn || now,
        updatedAt: now,
        updatedBy: email,
      };
      await subscriptions.updateOne({ _id: subscription._id }, { $set: set });
      await logAudit({
        admin,
        action: 'payment_failed',
        module: 'memberships',
        entityType: 'membership-subscriptions',
        entityId: String(subscription._id),
        entityLabel: subscription.memberName || null,
        before: { status: before.status },
        after: { status: 'payment_failed' },
        reason: 'Failed payment recorded; the expiry date was not changed',
        meta: { paymentId: String(item._id), amount: item.amount },
      });
      return;
    }

    const ledger: any = await writeLedger(db, item, 'paid', email);

    const currentExpiry = time(subscription.expiresOn);
    const paidTo = time(item.periodTo);
    const extended = paidTo !== null && (currentExpiry === null || paidTo > currentExpiry);
    const newExpiry = extended ? new Date(paidTo as number) : subscription.expiresOn || null;
    const stillValid = newExpiry !== null && new Date(newExpiry).getTime() >= today;
    const newStatus = stillValid ? 'active' : 'expired';
    const reference = ledger?.reference || item.gatewayPaymentId || null;

    const set: Record<string, any> = {
      status: newStatus,
      expiresOn: newExpiry,
      lastPaymentId: String(item._id),
      lastPaymentReference: reference,
      lastPaymentAt: item.paidOn || now,
      lastPaymentAmount: Number(item.amount) || 0,
      updatedAt: now,
      updatedBy: email,
    };
    if (newStatus !== subscription.status) {
      set.statusReason = item.kind === 'start' ? 'Payment recorded' : 'Renewal payment recorded';
      set.statusChangedAt = now;
      set.statusChangedBy = email;
    }
    if (item.kind === 'renewal') set.lastRenewedAt = now;
    if (item.plan && String(item.plan) !== String(subscription.plan)) {
      const plan = await findById(db, 'membershipPlans', item.plan);
      if (plan) Object.assign(set, { plan: String(plan._id), ...planSnapshot(plan) });
    }

    await subscriptions.updateOne({ _id: subscription._id }, { $set: set });
    await payments.updateOne(
      { _id: item._id },
      {
        $set: {
          ledgerReference: ledger?.reference || null,
          paidRecordedAt: ledger?.createdAt || now,
          effect: {
            previousStatus: subscription.status,
            previousExpiresOn: subscription.expiresOn || null,
            previousPlan: subscription.plan || null,
            newStatus,
            newExpiresOn: newExpiry,
            extended,
          },
        },
      }
    );

    await logAudit({
      admin,
      action: item.kind === 'start' ? 'payment_recorded' : 'renewal',
      module: 'memberships',
      entityType: 'membership-subscriptions',
      entityId: String(subscription._id),
      entityLabel: subscription.memberName || null,
      before: { ...before, lastPaymentReference: subscription.lastPaymentReference || null },
      after: { status: newStatus, expiresOn: newExpiry, lastPaymentReference: reference },
      reason: extended
        ? 'Paid payment recorded: expiry moved to the end of the paid period'
        : 'Paid payment recorded: the paid period does not go beyond the current expiry date',
      meta: { paymentId: String(item._id), amount: item.amount, periodFrom: item.periodFrom, periodTo: item.periodTo },
    });
  },

  async beforeUpdate({ db, existing, changes }) {
    // "Record as" only applies when the payment is first added.
    delete changes.recordAs;

    if (existing.status !== 'failed') {
      for (const key of LOCKED_AFTER_PAID) {
        if (key in changes && !same(changes[key], existing[key])) {
          return 'This payment is already in the ledger, so its member, plan, amount, date and period cannot be changed. If it was entered wrongly, mark it refunded with a reason and record the correct payment.';
        }
      }
      return;
    }

    if (Boolean(changes.periodFrom ?? existing.periodFrom) !== Boolean(changes.periodTo ?? existing.periodTo)) {
      return 'Enter both the period start and the period end, or leave both empty.';
    }
    const problem = periodProblem(
      changes.periodFrom ?? existing.periodFrom,
      changes.periodTo ?? existing.periodTo,
      'The period end must be after the period start.'
    );
    if (problem) return problem;

    if ('subscription' in changes && !same(changes.subscription, existing.subscription)) {
      const subscription = await findById(db, 'membershipSubscriptions', changes.subscription);
      if (!subscription) return 'The selected subscription does not exist.';
      changes.memberName = subscription.memberName;
      changes.memberPhone = subscription.memberPhone || '';
    }
    if (changes.plan && !same(changes.plan, existing.plan)) {
      const plan = await findById(db, 'membershipPlans', changes.plan);
      if (!plan) return 'The selected plan does not exist.';
      changes.planName = plan.name || '';
      changes.planPrice = Number(plan.price) || 0;
    }
  },

  beforeStatusChange({ from, to, admin, reason }) {
    if (from === 'paid' && to === 'refunded') {
      return { refundedAt: new Date(), refundedBy: admin.email || null, refundReason: reason };
    }
    if (from === 'failed') {
      return 'A failed payment stays failed. When the member pays, record a new payment for the subscription.';
    }
    if (from === 'refunded') return 'A refunded payment cannot be changed. Record a new payment instead.';
    return 'A paid payment can only be marked refunded.';
  },

  async afterStatusChange({ db, item, to, admin }) {
    if (to !== 'refunded') return;
    const email = admin.email || null;
    const refund: any = await writeLedger(db, item, 'refunded', email);
    await db
      .collection('membershipPayments')
      .updateOne({ _id: item._id }, { $set: { refundLedgerReference: refund?.reference || null, refundRecordedAt: refund?.createdAt || new Date() } });

    const subscriptions = db.collection('membershipSubscriptions');
    const subscription = await findById(db, 'membershipSubscriptions', item.subscription);
    // Only the payment that pays for the current period changes the subscription.
    if (!subscription || String(subscription.lastPaymentId || '') !== String(item._id)) return;

    const now = new Date();
    const reason = `Payment refunded${item.refundReason ? ': ' + item.refundReason : ''}`;
    const effect = item.effect || {};
    const set: Record<string, any> = { lastPaymentRefundedAt: now, updatedAt: now, updatedBy: email };

    if (effect.extended && effect.previousExpiresOn) {
      // A renewal is taken back: the subscription returns to the expiry it had before.
      set.expiresOn = new Date(effect.previousExpiresOn);
      if (subscription.status === 'active' && set.expiresOn.getTime() < todayStart().getTime()) set.status = 'expired';
    } else if (subscription.status !== 'cancelled') {
      // The only paid period was refunded: nothing is left to keep the membership open.
      set.status = 'cancelled';
      set.cancelledAt = now;
      set.cancelledBy = email;
      set.cancelReason = reason;
    }
    if (set.status) {
      set.statusReason = reason;
      set.statusChangedAt = now;
      set.statusChangedBy = email;
    }

    await subscriptions.updateOne({ _id: subscription._id }, { $set: set });
    await logAudit({
      admin,
      action: 'refund_applied',
      module: 'memberships',
      entityType: 'membership-subscriptions',
      entityId: String(subscription._id),
      entityLabel: subscription.memberName || null,
      before: { status: subscription.status, expiresOn: subscription.expiresOn || null },
      after: { status: set.status || subscription.status, expiresOn: set.expiresOn || subscription.expiresOn || null },
      reason,
      meta: { paymentId: String(item._id), amount: item.amount },
    });
  },

  beforeDelete({ existing }) {
    if (existing.status !== 'failed') {
      return 'This payment is in the ledger and cannot be deleted. Mark it refunded with a reason instead.';
    }
  },
});
