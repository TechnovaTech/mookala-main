import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase();
    const eventId = params.id;

    if (!ObjectId.isValid(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    const event = await db.collection('events').aggregate([
      {
        $match: { _id: new ObjectId(eventId) }
      },
      {
        $lookup: {
          from: 'organizers',
          localField: 'organizerId',
          foreignField: '_id',
          as: 'organizer'
        }
      },
      {
        $lookup: {
          from: 'artists',
          localField: 'artists',
          foreignField: '_id',
          as: 'artistDetails'
        }
      },
      {
        $unwind: {
          path: '$organizer',
          preserveNullAndEmptyArrays: true
        }
      }
    ]).toArray();

    if (event.length === 0) {
      return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, event: event[0] });
  } catch (error) {
    console.error('Error fetching event details:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch event details' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase();
    const eventId = params.id;

    if (!ObjectId.isValid(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    const result = await db.collection('events').deleteOne({ _id: new ObjectId(eventId) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete event' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase();
    const eventId = params.id;
    const { status, tickets } = await request.json();

    if (!ObjectId.isValid(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    // Get the event to check if it has artists
    const event = await db.collection('events').findOne({ _id: new ObjectId(eventId) });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    let updateData: any = { updatedAt: new Date() };

    // Organizer updating the ticket list on an existing event
    if (tickets !== undefined) {
      if (!Array.isArray(tickets)) {
        return NextResponse.json({ error: 'tickets must be an array' }, { status: 400 });
      }
      updateData.tickets = tickets;
    }

    if (status !== undefined) {
      updateData.status = status;

      // If admin is approving the event
      if (status === 'approved') {
        // Check if event has no artists selected
        const hasArtists = event.artists && Array.isArray(event.artists) && event.artists.length > 0;

        if (!hasArtists) {
          // No artists selected - directly set as accepted (organized)
          updateData.artistResponse = 'accepted';
        }
        // If artists are selected, keep current flow (wait for artist acceptance)
      }
    }

    // Nothing but the timestamp — reject rather than silently touching the event
    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const result = await db.collection('events').updateOne(
      { _id: new ObjectId(eventId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const message = status === 'approved' && !updateData.artistResponse
      ? 'Event approved successfully. Waiting for artist acceptance.'
      : status === 'approved' && updateData.artistResponse === 'accepted'
      ? 'Event approved and organized successfully (no artist required).'
      : status !== undefined
      ? 'Event status updated successfully'
      : 'Tickets updated successfully';

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}