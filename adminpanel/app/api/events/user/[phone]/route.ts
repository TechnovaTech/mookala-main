import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET(request: NextRequest, { params }: { params: { phone: string } }) {
  try {
    const { db } = await connectToDatabase();
    const userPhone = params.phone;

    // Find organizer by phone
    const organizer = await db.collection('organizers').findOne({ phone: userPhone });
    
    if (!organizer) {
      return NextResponse.json({ events: [] });
    }

    // Find events created by this organizer
    const events = await db.collection('events').find({ 
      organizerId: organizer._id 
    }).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching user events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}