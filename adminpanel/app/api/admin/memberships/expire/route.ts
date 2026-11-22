import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { sweepExpired } from '@/lib/resources/memberships.hooks';

export const dynamic = 'force-dynamic';

/**
 * "Update expired": stores "expired" on every active subscription whose expiry
 * date has passed. A subscription is valid through its "Expires on" date, so
 * it expires from the following day (India time).
 *
 * The notifications scheduler (/api/cron/notifications) also runs this regularly. The same update is also applied when
 * a membership screen is opened, and every screen and the app-facing status
 * work the status out from the date, so a lapsed subscription is never shown
 * as active. Every subscription changed gets its own activity log entry.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'memberships:manage');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    return ok(await sweepExpired(db, { admin: check.admin, request, via: 'update-expired' }));
  } catch (error) {
    console.error('Membership expiry update failed:', error);
    return fail('Failed to update expired subscriptions', 500);
  }
}
