import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok, toObjectId } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import { readBody, requireAppUser } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/artist/booking-response   { eventId, artistPhone, response: 'accepted' | 'rejected' }
 * Only an artist who is listed on the event can answer for it.
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  if (!body.eventId || !body.artistPhone || !body.response) {
    return fail('Event ID, artist phone, and response required', 400);
  }
  if (body.response !== 'accepted' && body.response !== 'rejected') {
    return fail('Response must be accepted or rejected', 400);
  }
  const eventId = toObjectId(body.eventId);
  if (!eventId) return fail('Invalid event ID', 400);

  const auth = requireAppUser(request, body.artistPhone);
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();

    const artist = await db.collection('artists').findOne({ phone: auth.phone }, { projection: { _id: 1 } });
    if (!artist) return fail('Artist not found', 404);

    const restricted = await restrictionFor(db, 'artists', auth.phone);
    if (restricted) return fail(restricted, 403);

    const now = new Date();
    const result = await db.collection('events').updateOne(
      { _id: eventId, artists: artist._id },
      { $set: { artistResponse: body.response, artistResponseDate: now, updatedAt: now } }
    );
    if (result.matchedCount === 0) return fail('Event not found', 404);

    return ok({ message: `Booking ${body.response} successfully` });
  } catch (error) {
    console.error('Booking response error:', error);
    return fail('Failed to update booking response', 500);
  }
}
