import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const artistPhone = searchParams.get('phone');

    if (!artistPhone) {
      return NextResponse.json({ error: 'Artist phone required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Find the artist by phone to get their ObjectId
    const artist = await db.collection('artists').findOne({ phone: artistPhone });
    
    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Find events where this artist is selected and has accepted
    const acceptedEvents = await db.collection('events').find({
      artists: artist._id,
      status: 'approved',
      artistResponse: 'accepted'
    }).toArray();

    // Get organizer details for each event
    const eventsWithDetails = await Promise.all(
      acceptedEvents.map(async (event) => {
        const organizer = await db.collection('organizers').findOne({ _id: event.organizerId });
        
        return {
          _id: event._id,
          eventTitle: event.name || 'Untitled Event',
          eventType: event.locationType || 'venue',
          eventDate: event.startDate,
          eventTime: event.startTime,
          venue: event.location?.venue || event.location?.address || 'Venue TBD',
          city: event.location?.city || 'City TBD',
          organizerName: organizer?.name || 'Unknown Organizer',
          organizerPhone: organizer?.phone || '',
          createdAt: event.createdAt
        };
      })
    );

    return NextResponse.json({ 
      success: true, 
      events: eventsWithDetails 
    });
  } catch (error) {
    console.error('Artist events error:', error);
    return NextResponse.json({ error: 'Failed to fetch artist events' }, { status: 500 });
  }
}