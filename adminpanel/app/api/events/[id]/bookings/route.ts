import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { db } = await connectToDatabase();
    const eventId = params.id;

    // Bookings store eventId as a plain string (that is what the apps and the
    // website send), so matching only on ObjectId returned an empty list for
    // every event. Accept both shapes.
    const eventIdMatches: any[] = [eventId];
    if (/^[a-fA-F0-9]{24}$/.test(eventId)) {
      eventIdMatches.push(new ObjectId(eventId));
    }

    const bookings = await db.collection('bookings').find({
      eventId: { $in: eventIdMatches }
    }).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({ success: true, bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}