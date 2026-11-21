import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { requireAppUser } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

function describe(event: any) {
  const place = event.location?.name || event.location?.venue || event.location?.address || '';
  const city = event.location?.city || '';

  if (event.locationType === 'venue') {
    return {
      eventType: 'Venue Event',
      venue: place && city ? `${place}, ${city}` : place || city || 'Venue TBD',
      description: `Live performance at ${event.location?.name || event.location?.venue || 'the venue'}. ${event.description || 'Contact organizer for more details.'}`,
    };
  }
  if (event.locationType === 'online') {
    return {
      eventType: 'Online Event',
      venue: 'Online Event',
      description: `Online virtual event. ${event.description || 'Platform details will be shared after confirmation.'}`,
    };
  }
  if (event.locationType === 'recorded') {
    return {
      eventType: 'Recorded Event',
      venue: 'Recorded Event',
      description: `Pre-recorded content event. ${event.recordedDetails?.instructions || event.description || 'Recording details will be shared after confirmation.'}`,
    };
  }
  return {
    eventType: 'Event',
    venue: 'Location TBD',
    description: event.description || 'Event details will be shared by the organizer.',
  };
}

/**
 * GET /api/artist/booking-requests?phone=
 * Approved events that list this artist and have no answer from the artist yet.
 */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, new URL(request.url).searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();

    const artist = await db.collection('artists').findOne({ phone: auth.phone }, { projection: { _id: 1 } });
    if (!artist) return fail('Artist not found', 404);

    const events = await db
      .collection('events')
      .find({ artists: artist._id, status: 'approved', artistResponse: { $exists: false } })
      .project({ media: 0, tickets: 0, scannerStaff: 0 })
      .toArray();

    const requests = await Promise.all(
      events.map(async (event) => {
        const organizer = await db
          .collection('organizers')
          .findOne({ _id: event.organizerId }, { projection: { name: 1, phone: 1 } });
        const shown = describe(event);

        return {
          _id: event._id,
          eventTitle: event.name || 'Untitled Event',
          eventType: shown.eventType,
          eventDate: event.startDate || 'Date TBD',
          eventTime: event.startTime || 'Time TBD',
          venue: shown.venue,
          city: event.location?.city || '',
          budget: event.budget || 'Budget to be discussed',
          description: shown.description,
          organizerName: organizer?.name || 'Unknown Organizer',
          organizerPhone: organizer?.phone || '',
          bookingStatus: 'pending',
          createdAt: event.createdAt,
          isUrgent: false,
        };
      })
    );

    return ok({ requests });
  } catch (error) {
    console.error('Booking requests error:', error);
    return fail('Failed to fetch booking requests', 500);
  }
}
