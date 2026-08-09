import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET(request: NextRequest, { params }: { params: { phone: string } }) {
  try {
    const { db } = await connectToDatabase();
    const userPhone = params.phone;

    // Find the creator by phone. Events can be created by an organizer or an
    // artist, so collect every matching account and look up events for all of them.
    const [organizer, artist] = await Promise.all([
      db.collection('organizers').findOne({ phone: userPhone }),
      db.collection('artists').findOne({ phone: userPhone }),
    ]);

    const creatorIds = [];
    if (organizer) creatorIds.push(organizer._id);
    if (artist) creatorIds.push(artist._id);

    if (creatorIds.length === 0) {
      return NextResponse.json({ events: [] });
    }

    // Find events created by this organizer/artist
    const events = await db.collection('events').find({
      organizerId: { $in: creatorIds }
    }).sort({ createdAt: -1 }).toArray();

    // Add booking status for each event
    const eventsWithStatus = events.map(event => {
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
        ...event,
        bookingStatus: bookingStatus,
        artistResponse: event.artistResponse || null
      };
    });

    return NextResponse.json({ events: eventsWithStatus });
  } catch (error) {
    console.error('Error fetching user events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}