import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok } from '@/lib/http';
import { makeRange } from '@/lib/reporting';
import { DAY_MS, istToday, sweepExpired, todayStart } from '@/lib/resources/memberships.hooks';
import { PAYMENTS, SUBSCRIPTIONS, linkLedgerEntries, revenueFigures } from '../_lib/data';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;

/**
 * Counts for the strip above the subscriptions list.
 *
 * Opening it first stores "expired" on subscriptions whose expiry date has
 * passed (the scheduler runs every 15 minutes; this also covers the time in between), so the list that loads next never shows a
 * lapsed subscription as active. Revenue is given two ways, from the payment
 * records and from the finance ledger, for this month and for all dates.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'memberships:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const swept = await sweepExpired(db, { admin: check.admin, request, via: 'on-read' });
    await linkLedgerEntries(db);

    const subscriptions = db.collection(SUBSCRIPTIONS);
    const today = todayStart();
    const soon = new Date(today.getTime() + WINDOW_DAYS * DAY_MS);
    const day = istToday();
    const month = makeRange(day.slice(0, 8) + '01', day, 'month');

    const [active, expiringSoon, expired, paymentFailed, cancelled, paused, failedPayments, revenueMonth, revenueAll] = await Promise.all([
      subscriptions.countDocuments({ status: 'active', expiresOn: { $gte: today } }),
      subscriptions.countDocuments({ status: 'active', expiresOn: { $gte: today, $lte: soon } }),
      subscriptions.countDocuments({ $or: [{ status: 'expired' }, { status: 'active', expiresOn: { $lt: today } }] }),
      subscriptions.countDocuments({ status: 'payment_failed' }),
      subscriptions.countDocuments({ status: 'cancelled' }),
      subscriptions.countDocuments({ status: 'paused' }),
      db.collection(PAYMENTS).countDocuments({ status: 'failed' }),
      revenueFigures(db, month),
      revenueFigures(db, null),
    ]);

    return ok({
      windowDays: WINDOW_DAYS,
      today: day,
      expiredOnOpen: swept.updated,
      active,
      expiringSoon,
      expired,
      paymentFailed,
      cancelled,
      paused,
      failedPayments,
      revenue: { month: { from: month.from, to: month.to, ...revenueMonth }, allTime: revenueAll },
      canManage: can(check.admin, 'memberships:manage'),
    });
  } catch (error) {
    console.error('Membership summary failed:', error);
    return fail('Failed to load the membership summary', 500);
  }
}
