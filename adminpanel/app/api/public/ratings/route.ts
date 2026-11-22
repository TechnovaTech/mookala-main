import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok, toObjectId } from '@/lib/http';
import { ratingSummary, type RatingSubject } from '@/lib/resources/support.hooks';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/ratings?eventId= | artistId= | organizerId=   (public)
 * Published ratings only: the average, the count, the number of ratings per
 * star and the latest published comments with the customer's first name.
 * Nothing that waits for moderation or was hidden, and no phone numbers.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const given = (['event', 'artist', 'organizer'] as RatingSubject[]).filter((s) => params.get(s + 'Id'));
  if (given.length !== 1) return fail('Give exactly one of eventId, artistId or organizerId.', 400);
  const subject = given[0];
  const id = params.get(subject + 'Id') || '';
  if (!toObjectId(id)) return fail('Invalid id', 400);
  const limit = Math.min(50, Math.max(1, parseInt(params.get('limit') || '20', 10) || 20));

  try {
    const { db } = await connectToDatabase();
    const summary = await ratingSummary(db, subject, id, { publicView: true, limit });
    return ok({
      [subject + 'Id']: id,
      average: summary.average,
      count: summary.count,
      distribution: summary.distribution,
      comments: summary.recent
        .filter((r) => r.comment.trim())
        .map((r) => ({ rating: r.rating, comment: r.comment, name: r.name, at: r.at })),
    });
  } catch (error) {
    console.error('Public ratings failed:', error);
    return fail('Could not load the ratings', 500);
  }
}
