import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { eventId, artistPhone, response } = await request.json();

    if (!eventId || !artistPhone || !response) {
      return NextResponse.json({ error: 'Event ID, artist phone, and response required' }, { status: 400 });
    }

    if (!['accepted', 'rejected'].includes(response)) {
      return NextResponse.json({ error: 'Response must be accepted or rejected' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Update event with artist response
    const result = await db.collection('events').updateOne(
      { _id: new ObjectId(eventId) },
      { 
        $set: { 
          artistResponse: response,
          artistResponseDate: new Date(),
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Booking ${response} successfully` 
    });
  } catch (error) {
    console.error('Booking response error:', error);
    return NextResponse.json({ error: 'Failed to update booking response' }, { status: 500 });
  }
}