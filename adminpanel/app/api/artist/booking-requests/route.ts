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
    
    // First find the artist by phone to get their ObjectId
    const artist = await db.collection('artists').findOne({ phone: artistPhone });
    
    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Find events where this artist is in the artists array, admin approved, and no response yet
    const bookingRequests = await db.collection('events').find({
      artists: artist._id, // Check if artist ID is in the artists array
      status: 'approved', // Only show admin-approved events
      artistResponse: { $exists: false } // Only show events without artist response
    }).toArray();

    console.log('Found booking requests:', bookingRequests.length);
    console.log('Sample event:', bookingRequests[0]);

    // Get organizer details for each request
    const requestsWithDetails = await Promise.all(
      bookingRequests.map(async (event) => {
        const organizer = await db.collection('organizers').findOne({ _id: event.organizerId });
        
        console.log('Event data:', {
          name: event.name,
          locationType: event.locationType,
          startDate: event.startDate,
          startTime: event.startTime,
          location: event.location,
          organizerId: event.organizerId,
          organizer: organizer
        });
        
        // Determine location based on event type
        let locationDisplay = '';
        if (event.locationType === 'venue') {
          const venue = event.location?.venue || event.location?.address || '';
          const city = event.location?.city || '';
          locationDisplay = venue && city ? `${venue}, ${city}` : venue || city || 'Venue TBD';
        } else if (event.locationType === 'online') {
          locationDisplay = 'Online Event';
        } else if (event.locationType === 'recorded') {
          locationDisplay = 'Recorded Event';
        } else {
          locationDisplay = 'Location TBD';
        }

        // Create proper description
        let eventDescription = '';
        if (event.locationType === 'venue') {
          eventDescription = `Live performance at ${event.location?.venue || 'venue'}. ${event.description || 'Contact organizer for more details.'}`;
        } else if (event.locationType === 'online') {
          eventDescription = `Online virtual event. ${event.description || 'Platform details will be shared after confirmation.'}`;
        } else if (event.locationType === 'recorded') {
          eventDescription = `Pre-recorded content event. ${event.recordedDetails?.instructions || event.description || 'Recording details will be shared after confirmation.'}`;
        } else {
          eventDescription = event.description || 'Event details will be shared by the organizer.';
        }

        return {
          _id: event._id,
          eventTitle: event.name || 'Untitled Event',
          eventType: event.locationType === 'venue' ? 'Venue Event' : 
                    event.locationType === 'online' ? 'Online Event' : 
                    event.locationType === 'recorded' ? 'Recorded Event' : 'Event',
          eventDate: event.startDate || 'Date TBD',
          eventTime: event.startTime || 'Time TBD',
          venue: locationDisplay,
          city: event.location?.city || '',
          budget: event.budget || 'Budget to be discussed',
          description: eventDescription,
          organizerName: organizer?.name || 'Unknown Organizer',
          organizerPhone: organizer?.phone || '',
          bookingStatus: 'pending',
          createdAt: event.createdAt,
          isUrgent: false
        };
      })
    );

    console.log('Processed requests:', requestsWithDetails);

    return NextResponse.json({ 
      success: true, 
      requests: requestsWithDetails 
    });
  } catch (error) {
    console.error('Booking requests error:', error);
    return NextResponse.json({ error: 'Failed to fetch booking requests' }, { status: 500 });
  }
}