import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok, toObjectId } from '@/lib/http';
import { phoneVariants, sweepExpired } from '@/lib/resources/memberships.hooks';
import { PAYMENTS, PLANS, SUBSCRIPTIONS, planNames, viewSubscription, canSeeMemberContacts, withoutContacts } from '../../_lib/data';

export const dynamic = 'force-dynamic';

interface TimelineEvent {
  at: any;
  type: string;
  title: string;
  detail: string;
  by: string | null;
  tone: 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'purple';
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  expired: 'Expired',
  cancelled: 'Cancelled',
  payment_failed: 'Payment failed',
  paused: 'Paused',
};

/**
 * The member view: one subscription with its plan, its payments, the
 * reminders made for it, what happened to it over time and the member's
 * membership support cases.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'memberships:view');
  if (!check.ok) return check.response;

  const id = toObjectId(params.id);
  if (!id) return fail('Invalid subscription id');

  try {
    const { db } = await connectToDatabase();
    await sweepExpired(db, { admin: check.admin, request, via: 'on-read' });

    const subscription = await db.collection(SUBSCRIPTIONS).findOne({ _id: id });
    if (!subscription) return fail('Subscription not found', 404);

    const canSeeSupport = can(check.admin, 'support:view');
    const [names, plan, payments, history, cases] = await Promise.all([
      planNames(db, [subscription]),
      toObjectId(String(subscription.plan || '')) ? db.collection(PLANS).findOne({ _id: toObjectId(String(subscription.plan))! }) : null,
      db.collection(PAYMENTS).find({ subscription: String(id) }).sort({ paidOn: -1, createdAt: -1 }).limit(500).toArray(),
      db
        .collection('auditLogs')
        .find({ entityType: 'membership-subscriptions', entityId: String(id) })
        .sort({ createdAt: -1 })
        .limit(300)
        .toArray(),
      canSeeSupport
        ? db
            .collection('supportCases')
            .find({ service: 'membership', customerPhone: { $in: phoneVariants(String(subscription.memberPhone || '')) } })
            .sort({ createdAt: -1 })
            .limit(100)
            .project({ subject: 1, kind: 1, status: 1, priority: 1, createdAt: 1, resolvedAt: 1 })
            .toArray()
        : [],
    ]);

    const timeline: TimelineEvent[] = [];
    const money = (value: any) => '₹' + (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    const day = (value: any) =>
      value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

    for (const payment of payments) {
      const period = payment.periodFrom && payment.periodTo ? `, for ${day(payment.periodFrom)} to ${day(payment.periodTo)}` : '';
      if (payment.status === 'failed') {
        timeline.push({
          at: payment.createdAt,
          type: 'payment_failed',
          title: 'Payment failed',
          detail: `${money(payment.amount)} dated ${day(payment.paidOn)}${period}. The expiry date was not changed.`,
          by: payment.createdBy || null,
          tone: 'red',
        });
        continue;
      }
      const effect = payment.effect || {};
      timeline.push({
        at: payment.paidRecordedAt || payment.createdAt,
        type: payment.kind === 'renewal' ? 'renewal' : 'payment',
        title: payment.kind === 'renewal' ? 'Renewal payment recorded' : 'Payment recorded',
        detail:
          `${money(payment.amount)} dated ${day(payment.paidOn)}${period}.` +
          (effect.extended ? ` Expiry moved from ${day(effect.previousExpiresOn) || 'none'} to ${day(effect.newExpiresOn)}.` : '') +
          (payment.ledgerReference ? ` Ledger ${payment.ledgerReference}.` : ''),
        by: payment.createdBy || null,
        tone: 'green',
      });
      if (payment.status === 'refunded') {
        timeline.push({
          at: payment.refundedAt || payment.statusChangedAt || payment.updatedAt,
          type: 'refund',
          title: 'Payment refunded',
          detail: `${money(payment.amount)}${payment.refundReason ? `: ${payment.refundReason}` : ''}`,
          by: payment.refundedBy || payment.statusChangedBy || null,
          tone: 'purple',
        });
      }
    }

    const reminders: any[] = Array.isArray(subscription.reminders) ? subscription.reminders : [];
    for (const reminder of reminders) {
      const byHand = reminder.kind === 'manual' || (!reminder.kind && !reminder.status);
      timeline.push({
        at: reminder.at,
        type: 'reminder',
        title: byHand
          ? 'Reminder made by hand (recorded by the team)'
          : reminder.status === 'accepted'
            ? 'Reminder accepted by the provider'
            : reminder.status === 'failed'
              ? 'Reminder refused by the provider'
              : 'Reminder not sent',
        detail: `${reminder.channel}${reminder.error ? `: ${reminder.error}` : ''}${reminder.note ? `. ${reminder.note}` : ''}`,
        by: reminder.byName || reminder.by || null,
        tone: byHand || reminder.status === 'accepted' ? 'blue' : 'amber',
      });
    }

    // Status changes, creation and edits come from the activity log. Payments and reminders are already listed above.
    const covered = new Set(['payment_recorded', 'renewal', 'payment_failed', 'reminder_send', 'reminder_recorded', 'note']);
    for (const entry of history) {
      if (covered.has(entry.action)) continue;
      const who = entry.adminName || entry.adminEmail || (entry.meta?.via === 'on-read' ? 'System' : null);
      if (entry.action === 'create') {
        timeline.push({ at: entry.createdAt, type: 'created', title: 'Subscription created', detail: '', by: who, tone: 'gray' });
      } else if (entry.action === 'status_change' || entry.action === 'refund_applied') {
        const to = String(entry.after?.status || '');
        const from = String(entry.before?.status || '');
        const reinstated = from === 'cancelled';
        timeline.push({
          at: entry.createdAt,
          type: reinstated ? 'reinstated' : to || 'status',
          title: reinstated
            ? `Reinstated (now ${STATUS_LABEL[to] || to})`
            : from === to
              ? 'Refund applied'
              : `Status changed from ${STATUS_LABEL[from] || from} to ${STATUS_LABEL[to] || to}`,
          detail: entry.reason || '',
          by: who,
          tone: to === 'cancelled' ? 'red' : to === 'active' ? 'green' : 'gray',
        });
      } else if (entry.action === 'update') {
        const fields = Object.keys(entry.after || {}).join(', ');
        timeline.push({
          at: entry.createdAt,
          type: 'edited',
          title: 'Details edited',
          detail: `${fields}${entry.reason ? `. Reason: ${entry.reason}` : ''}`,
          by: who,
          tone: 'gray',
        });
      }
    }
    timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const paid = payments.filter((p) => p.status === 'paid' || p.status === 'refunded');
    const refunded = payments.filter((p) => p.status === 'refunded');
    const sum = (rows: any[]) => Math.round(rows.reduce((total, row) => total + (Number(row.amount) || 0), 0) * 100) / 100;

    return ok(contactsFor(check.admin, {
      subscription: viewSubscription(subscription, names),
      plan: plan
        ? { _id: String(plan._id), name: plan.name, price: plan.price, billingPeriod: plan.billingPeriod, audience: plan.audience, status: plan.status }
        : null,
      payments: payments.map((p) => ({
        _id: String(p._id),
        status: p.status,
        kind: p.kind || null,
        amount: p.amount,
        paidOn: p.paidOn,
        periodFrom: p.periodFrom || null,
        periodTo: p.periodTo || null,
        method: p.method || null,
        planName: p.planName || '',
        planPrice: p.planPrice ?? null,
        ledgerReference: p.ledgerReference || null,
        gatewayPaymentId: p.gatewayPaymentId || null,
        refundReason: p.refundReason || null,
        refundedAt: p.refundedAt || null,
        createdBy: p.createdBy || null,
      })),
      totals: {
        paidCount: paid.length,
        paid: sum(paid),
        refundedCount: refunded.length,
        refunded: sum(refunded),
        failedCount: payments.filter((p) => p.status === 'failed').length,
        renewals: payments.filter((p) => p.kind === 'renewal' && p.status === 'paid').length,
        reminders: reminders.length,
      },
      timeline,
      supportCases: cases.map((c: any) => ({
        _id: String(c._id),
        kind: c.kind || 'ticket',
        subject: c.subject || '',
        status: c.status || '',
        priority: c.priority || '',
        createdAt: c.createdAt || null,
      })),
      canSeeSupport,
      canManage: can(check.admin, 'memberships:manage'),
      // Payments are Membership Payments records, which Finance records ('finance:manage').
      canRecordPayments: can(check.admin, 'finance:manage'),
    }));
  } catch (error) {
    console.error('Member view failed:', error);
    return fail('Failed to load the member view', 500);
  }
}

/** Members' phone numbers and emails only for roles that may see them. */
function contactsFor<T>(admin: any, payload: T): T {
  return canSeeMemberContacts(admin) ? payload : withoutContacts(payload);
}
