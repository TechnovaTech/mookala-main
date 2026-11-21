import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok } from '@/lib/http';
import { DAY_MS, sweepExpired, todayStart } from '@/lib/resources/memberships.hooks';
import { PAYMENTS, SUBSCRIPTIONS, planNames, viewSubscription, canSeeMemberContacts, withoutContacts } from '../_lib/data';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 300;
const OPEN_CASE = ['open', 'in_progress', 'waiting_customer', 'escalated'];

/**
 * The follow-up worklist: failed renewals, cancellations, subscriptions that
 * expire soon or have lapsed, and membership support cases.
 *   ?days=30   how far ahead "expiring soon" looks (1 to 90)
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'memberships:view');
  if (!check.ok) return check.response;

  const requested = request.nextUrl.searchParams.get('days');
  const days = requested === null || requested === '' ? 30 : Number(requested);
  if (!Number.isInteger(days) || days < 1 || days > 90) return fail('Choose between 1 and 90 days.');

  try {
    const { db } = await connectToDatabase();
    await sweepExpired(db, { admin: check.admin, request, via: 'on-read' });

    const subscriptions = db.collection(SUBSCRIPTIONS);
    const today = todayStart();
    const until = new Date(today.getTime() + days * DAY_MS);
    const canSeeSupport = can(check.admin, 'support:view');

    const filters = {
      failed: { status: 'payment_failed' },
      cancelled: { status: 'cancelled' },
      expiring: { status: 'active', expiresOn: { $gte: today, $lte: until } },
      lapsed: { $or: [{ status: 'expired' }, { status: 'active', expiresOn: { $lt: today } }] },
    };

    const [failed, cancelled, expiring, lapsed, counts, caseCounts, cases] = await Promise.all([
      subscriptions.find(filters.failed).sort({ lastFailedPaymentAt: -1, expiresOn: 1 }).limit(LIST_LIMIT).toArray(),
      subscriptions.find(filters.cancelled).sort({ cancelledAt: -1, statusChangedAt: -1 }).limit(LIST_LIMIT).toArray(),
      subscriptions.find(filters.expiring).sort({ expiresOn: 1 }).limit(LIST_LIMIT).toArray(),
      subscriptions.find(filters.lapsed).sort({ expiresOn: -1 }).limit(LIST_LIMIT).toArray(),
      Promise.all(Object.values(filters).map((filter) => subscriptions.countDocuments(filter))),
      Promise.all([
        db.collection('supportCases').countDocuments({ service: 'membership' }),
        db.collection('supportCases').countDocuments({ service: 'membership', status: { $in: OPEN_CASE } }),
      ]),
      canSeeSupport
        ? db
            .collection('supportCases')
            .find({ service: 'membership' })
            .sort({ createdAt: -1 })
            .limit(LIST_LIMIT)
            .project({ subject: 1, kind: 1, status: 1, priority: 1, customerName: 1, customerPhone: 1, assignedTeam: 1, createdAt: 1 })
            .toArray()
        : [],
    ]);

    const all = [...failed, ...cancelled, ...expiring, ...lapsed];
    const names = await planNames(db, all);

    // The failed payment behind each failed renewal.
    const failedIds = failed.map((s) => String(s._id));
    const failedPayments = failedIds.length
      ? await db
          .collection(PAYMENTS)
          .find({ subscription: { $in: failedIds }, status: 'failed' })
          .sort({ createdAt: -1 })
          .project({ subscription: 1, amount: 1, paidOn: 1, method: 1 })
          .toArray()
      : [];
    const lastFailed = new Map<string, any>();
    for (const payment of failedPayments) if (!lastFailed.has(payment.subscription)) lastFailed.set(payment.subscription, payment);

    const view = (rows: any[]) => rows.map((row) => viewSubscription(row, names, today));

    return ok(contactsFor(check.admin, {
      days,
      counts: { failed: counts[0], cancelled: counts[1], expiring: counts[2], lapsed: counts[3], supportCases: caseCounts[0], openSupportCases: caseCounts[1] },
      listLimit: LIST_LIMIT,
      failed: view(failed).map((row) => {
        const payment = lastFailed.get(row._id);
        return {
          ...row,
          failedPayment: payment ? { amount: payment.amount, paidOn: payment.paidOn, method: payment.method || null } : null,
          failedPaymentCount: failedPayments.filter((p) => p.subscription === row._id).length,
        };
      }),
      cancelled: view(cancelled),
      expiring: view(expiring),
      lapsed: view(lapsed),
      supportCases: cases.map((c: any) => ({
        _id: String(c._id),
        kind: c.kind || 'ticket',
        subject: c.subject || '',
        customerName: c.customerName || '',
        customerPhone: c.customerPhone || '',
        status: c.status || '',
        priority: c.priority || '',
        assignedTeam: c.assignedTeam || '',
        createdAt: c.createdAt || null,
      })),
      canSeeSupport,
      canManage: can(check.admin, 'memberships:manage'),
      // Payments are Membership Payments records, which Finance records ('finance:manage').
      canRecordPayments: can(check.admin, 'finance:manage'),
    }));
  } catch (error) {
    console.error('Membership renewals worklist failed:', error);
    return fail('Failed to load renewals and cancellations', 500);
  }
}

/** Members' phone numbers and emails only for roles that may see them. */
function contactsFor<T>(admin: any, payload: T): T {
  return canSeeMemberContacts(admin) ? payload : withoutContacts(payload);
}
