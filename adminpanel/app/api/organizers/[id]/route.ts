import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase();
    const organizer = await db.collection('organizers').findOne({ _id: new ObjectId(params.id) });
    
    if (!organizer) {
      return NextResponse.json({ success: false, error: 'Organizer not found' }, { status: 404 });
    }

    const events = await db.collection('events')
      .find({ organizerId: new ObjectId(params.id) })
      .toArray();

    return NextResponse.json({ 
      success: true, 
      organizer: {
        _id: organizer._id.toString(),
        phone: organizer.phone,
        name: organizer.name,
        email: organizer.email,
        city: organizer.city,
        status: organizer.status,
        kycStatus: organizer.kycStatus,
        aadharId: organizer.aadharId,
        panId: organizer.panId,
        createdAt: organizer.createdAt,
        events: events.map(e => ({
          _id: e._id.toString(),
          name: e.name,
          date: e.startDate,
          location: e.location,
          status: e.status
        }))
      }
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch organizer' }, { status: 500 });
  }
}
