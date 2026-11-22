import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok, toObjectId } from '@/lib/http';
import { ratingSummary, type RatingSubject } from '@/lib/resources/support.hooks';

export const dynamic = 'force-dynamic';

const PAGE_PERMISSION: Record<RatingSubject, string> = {
  event: 'events:view',
  artist: 'artists:view',
  organizer: 'organizers:view',
};

/**
 * GET /api/admin/support/ratings?eventId= | artistId= | organizerId=
 * The ratings section of the event, artist and organiser pages: the published
 * average and count, how many ratings wait for moderation or are hidden, and
 * the latest published ones. Needs support:view or the page's own view
 * permission (events:view, artists:view or organizers:view).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const given = (['event', 'artist', 'organizer'] as RatingSubject[]).filter((s) => params.get(s + 'Id'));
  if (given.length !== 1) return fail('Give exactly one of eventId, artistId or organizerId.', 400);
  const subject = given[0];
  const id = params.get(subject + 'Id') || '';
  if (!toObjectId(id)) return fail('Invalid id', 400);

  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  if (!can(check.admin, 'support:view') && !can(check.admin, PAGE_PERMISSION[subject])) {
    return fail('You do not have permission to do this.', 403);
  }

  try {
    const { db } = await connectToDatabase();
    const summary = await ratingSummary(db, subject, id, { limit: 10 });
    return ok({ subject, id, ...summary, canModerate: can(check.admin, 'support:manage') });
  } catch (error) {
    console.error('Admin ratings failed:', error);
    return fail('Failed to load the ratings', 500);
  }
}
