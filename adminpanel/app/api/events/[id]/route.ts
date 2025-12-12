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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase();
    const eventId = params.id;
    const { status } = await request.json();

    if (!ObjectId.isValid(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    // Get the event to check if it has artists
    const event = await db.collection('events').findOne({ _id: new ObjectId(eventId) });
    
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    let updateData: any = { 
      status,
      updatedAt: new Date()
    };

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
      : 'Event status updated successfully';

    return NextResponse.json({ message });
  } catch (error) {
    console.error('Error updating event status:', error);
    return NextResponse.json({ error: 'Failed to update event status' }, { status: 500 });
  }
}