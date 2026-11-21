import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import { readBody, requireAppUser } from '@/lib/app-auth';
import { applyChanges, loadCalendar, readChanges, readRange, summarise, todayInIndia } from '@/app/api/admin/artists/_availability';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * GET /api/artist/availability?phone=&from=YYYY-MM-DD&to=YYYY-MM-DD
 * The artist's own calendar, one entry per day. Without from/to it covers
 * today and the next 30 days. A day with an accepted event is 'booked' and
 * lists the event.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const auth = requireAppUser(request, params.get('phone'));
  if (!auth.ok) return auth.response;

  const range = readRange(params.get('from'), params.get('to'));
  if ('error' in range) return fail(range.error, 400);

  try {
    const { db } = await connectToDatabase();
    const artist = await db.collection('artists').findOne({ phone: auth.phone }, { projection: { _id: 1 } });
    if (!artist) return fail('Artist not found', 404);

    const days = await loadCalendar(db, artist._id, range.from, range.to);
    return ok({
      from: range.from,
      to: range.to,
      days: days.map((day) => ({
        date: day.date,
        status: day.status,
        note: day.note,
        source: day.source,
        events: day.events.map((event) => ({ _id: event._id, name: event.name })),
        updatedAt: day.updatedAt,
      })),
      summary: summarise(days),
    });
  } catch (error) {
    console.error('Artist availability read failed:', error);
    return fail('Failed to load availability', 500);
  }
}

/**
 * POST /api/artist/availability
 *   { phone, days: [{ date, status, note }] }
 *   { phone, dates: ['YYYY-MM-DD'], status, note }
 * status: 'available' | 'unavailable', or 'clear' to remove what was set.
 * Only the artist's own days, today or later. A day with an accepted event,
 * or one Mookalaa marked as booked, is refused and nothing is saved.
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  const auth = requireAppUser(request, body.phone);
  if (!auth.ok) return auth.response;

  const parsed = readChanges(body, ['available', 'unavailable', 'clear']);
  if ('error' in parsed) return fail(parsed.error, 400);

  const today = todayInIndia();
  const past = parsed.changes.find((change) => change.date < today);
  if (past) return fail(`${past.date} is in the past. Only today and later days can be set.`, 400);

  try {
    const { db } = await connectToDatabase();
    const artist = await db.collection('artists').findOne({ phone: auth.phone }, { projection: { _id: 1 } });
    if (!artist) return fail('Artist not found', 404);

    const restricted = await restrictionFor(db, 'artists', auth.phone);
    if (restricted) return fail(restricted, 403);

    const result = await applyChanges({ db, artistId: artist._id, changes: parsed.changes, by: auth.phone, role: 'artist' });
    if (result.refused.length || result.locked.length) {
      const dates = [...result.refused.map((entry) => entry.date), ...result.locked].sort();
      return fail(
        `You are booked on ${dates.join(', ')}, so ${dates.length === 1 ? 'that day' : 'those days'} cannot be changed. Nothing was saved.`,
        409,
        {
          bookedDates: dates,
          events: result.refused.map((entry) => ({ date: entry.date, events: entry.events.map((e) => ({ _id: e._id, name: e.name })) })),
        }
      );
    }

    const dates = parsed.changes.map((change) => change.date).sort();
    const days = await loadCalendar(db, artist._id, dates[0], dates[dates.length - 1]);
    const wanted = new Set(dates);
    return ok({
      message: 'Availability saved',
      changed: Object.keys(result.after).length,
      days: days
        .filter((day) => wanted.has(day.date))
        .map((day) => ({ date: day.date, status: day.status, note: day.note, source: day.source })),
    });
  } catch (error) {
    console.error('Artist availability update failed:', error);
    return fail('Failed to save availability', 500);
  }
}
