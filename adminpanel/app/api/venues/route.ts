import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const venues = await db.collection('venues').find({}).toArray();
    
    return NextResponse.json({ 
      success: true, 
      venues: venues.map(v => ({
        _id: v._id.toString(),
        name: v.name,
        location: v.location,
        capacity: v.capacity,
        amenities: v.amenities || [],
        status: v.status || 'active',
        createdAt: v.createdAt
      }))
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch venues' }, { status: 500 });
  }
}
