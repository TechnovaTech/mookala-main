import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { promotionSchedule, syncPromotionStatuses } from '../../_lib/promotions';

export const dynamic = 'force-dynamic';

const DAY = 24 * 3600 * 1000;
const MAX_WEEKS = 26;

/**
 * GET ?weeks=8&from=YYYY-MM-DD
 *
 * Promotions that touch the window, per placement, with the status their
 * dates give them and the other promotions each one overlaps on the same
 * placement. Opening it brings stored statuses up to date first (scheduled ->
 * live -> ended), with each automatic change in the activity log.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'marketing:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  const weeksRaw = parseInt(params.get('weeks') || '8', 10);
  const weeks = Number.isFinite(weeksRaw) ? Math.min(MAX_WEEKS, Math.max(1, weeksRaw)) : 8;
  const fromRaw = params.get('from');
  let from: Date;
  if (fromRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || Number.isNaN(new Date(fromRaw + 'T00:00:00+05:30').getTime())) {
      return fail('The start of the window is not a valid date.');
    }
    from = new Date(fromRaw + 'T00:00:00+05:30');
  } else {
    // Midnight today, India time.
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    from = new Date(ist + 'T00:00:00+05:30');
  }
  const to = new Date(from.getTime() + weeks * 7 * DAY);

  try {
    const { db } = await connectToDatabase();
    const changes = await syncPromotionStatuses(db, { admin: check.admin, request, trigger: 'promotion schedule opened' });
    const schedule = await promotionSchedule(db, from, to);
    return ok({ ...schedule, weeks, changes, timezone: 'Asia/Kolkata' });
  } catch (error) {
    console.error('Promotion schedule failed:', error);
    return fail('Could not load the promotion schedule', 500);
  }
}
