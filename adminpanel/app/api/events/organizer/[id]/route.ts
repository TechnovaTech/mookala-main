import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { db } = await connectToDatabase();
    const organizerId = params.id;

    const events = await db.collection('events').find({
      organizerId: new ObjectId(organizerId)
    }).toArray();

    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error('Error fetching organizer events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}