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

    const organizer = await db.collection('organizers').findOne({
      _id: new ObjectId(organizerId)
    });

    if (!organizer) {
      return NextResponse.json({ error: 'Organizer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, organizer });
  } catch (error) {
    console.error('Error fetching organizer:', error);
    return NextResponse.json({ error: 'Failed to fetch organizer' }, { status: 500 });
  }
}