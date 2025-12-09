import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { db } = await connectToDatabase();
    const venue = await db.collection('venues').findOne({ _id: new ObjectId(params.id) });
    
    if (!venue) {
      return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });
    }
    
    return NextResponse.json({ 
      success: true, 
      venue: {
        _id: venue._id.toString(),
        name: venue.name,
        location: venue.location,
        capacity: venue.capacity,
        amenities: venue.amenities || [],
        status: venue.status || 'active',
        image: venue.image || null,
        createdAt: venue.createdAt,
        seatCategories: venue.seatCategories || { VIP: '', Premium: '', Normal: '', Balcony: '' }
      }
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch venue' }, { status: 500 });
  }
}
