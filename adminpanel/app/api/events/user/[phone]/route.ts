import { NextRequest, NextResponse } from 'next/server';
import { requireAppUser } from '@/lib/app-auth';
import { connectToDatabase } from '@/lib/mongodb';
import { asString } from '@/lib/http';
import { sanitiseEvent } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

/** GET /api/events/user/[phone]: the organiser app's "my events" list. */
export async function GET(request: NextRequest, { params }: { params: { phone: string } }) {
  try {
    const userPhone = asString(params.phone, 30);
    if (!userPhone) return NextResponse.json({ events: [] });
    const gate = requireAppUser(request, userPhone);
    if (!gate.ok) return gate.response;

    const { db } = await connectToDatabase();

    // Events can be created by an organiser or an artist, so collect every
    // matching account and look up events for all of them.
    const [organizer, artist] = await Promise.all([
      db.collection('organizers').findOne({ phone: userPhone }, { projection: { _id: 1 } }),
      db.collection('artists').findOne({ phone: userPhone }, { projection: { _id: 1 } }),
    ]);

    const creatorIds = [];
    if (organizer) creatorIds.push(organizer._id);
    if (artist) creatorIds.push(artist._id);

    if (creatorIds.length === 0) {
      return NextResponse.json({ events: [] });
    }

    const events = await db
      .collection('events')
      .find({ organizerId: { $in: creatorIds } })
      .sort({ createdAt: -1 })
      .toArray();

    const eventsWithStatus = events.map((event) => {
      let bookingStatus = 'pending';
      if (event.status === 'approved' && event.artists && event.artists.length > 0) {
        if (event.artistResponse === 'accepted') {
          bookingStatus = 'confirmed';
        } else if (event.artistResponse === 'rejected') {
          bookingStatus = 'artist_declined';
        } else {
          bookingStatus = 'artist_pending';
        }
      } else if (event.status === 'approved') {
        bookingStatus = 'approved';
      } else if (event.status === 'rejected') {
        bookingStatus = 'rejected';
      }

      return {
        // The creator sees their staff's contact details, never the passwords.
        ...sanitiseEvent(event, 'contacts'),
        bookingStatus,
        artistResponse: event.artistResponse || null,
      };
    });

    return NextResponse.json({ events: eventsWithStatus });
  } catch (error) {
    console.error('Error fetching user events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
