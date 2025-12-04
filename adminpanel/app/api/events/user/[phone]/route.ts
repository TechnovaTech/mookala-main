import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET(request: NextRequest, { params }: { params: { phone: string } }) {
  try {
    const { db } = await connectToDatabase();
    const userPhone = params.phone;

    // Find organizer by phone
    const organizer = await db.collection('organizers').findOne({ phone: userPhone });
    
    if (!organizer) {
      return NextResponse.json({ events: [] });
    }

    // Find events created by this organizer
    const events = await db.collection('events').find({ 
      organizerId: organizer._id 
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