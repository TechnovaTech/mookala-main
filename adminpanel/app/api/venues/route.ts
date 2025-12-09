import { NextRequest, NextResponse } from 'next/server';
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
        image: v.image || null,
        createdAt: v.createdAt
      }))
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch venues' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, address, city, state, capacity, image } = await request.json();
    
    if (!name || !address || !city || !state || !capacity) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (image && !image.match(/^data:image\/(png|jpg|jpeg|svg\+xml);base64,/)) {
      return NextResponse.json({ success: false, error: 'Invalid image format. Only PNG, JPG, and SVG are allowed' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const result = await db.collection('venues').insertOne({
      name,
      location: { address, city, state },
      capacity: parseInt(capacity),
      image: image || null,
      status: 'active',
      amenities: [],
      createdAt: new Date()
    });

    return NextResponse.json({ success: true, venueId: result.insertedId });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add venue' }, { status: 500 });
  }
}
