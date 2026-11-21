import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { requireAppUser } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** GET /api/artist/events?phone=   Approved events this artist has accepted. */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, new URL(request.url).searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();

    const artist = await db.collection('artists').findOne({ phone: auth.phone }, { projection: { _id: 1 } });
    if (!artist) return fail('Artist not found', 404);

    const accepted = await db
      .collection('events')
      .find({ artists: artist._id, status: 'approved', artistResponse: 'accepted' })
      .project({ media: 0, tickets: 0, scannerStaff: 0 })
      .toArray();

    const events = await Promise.all(
      accepted.map(async (event) => {
        const organizer = await db
          .collection('organizers')
          .findOne({ _id: event.organizerId }, { projection: { name: 1, phone: 1 } });

        return {
          _id: event._id,
          eventTitle: event.name || 'Untitled Event',
          eventType: event.locationType || 'venue',
          eventDate: event.startDate,
          eventTime: event.startTime,
          venue: event.location?.name || event.location?.venue || event.location?.address || 'Venue TBD',
          city: event.location?.city || 'City TBD',
          organizerName: organizer?.name || 'Unknown Organizer',
          organizerPhone: organizer?.phone || '',
          createdAt: event.createdAt,
        };
      })
    );

    return ok({ events });
  } catch (error) {
    console.error('Artist events error:', error);
    return fail('Failed to fetch artist events', 500);
  }
}
