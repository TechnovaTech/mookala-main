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
        seatingLayoutImage: venue.seatingLayoutImage || null,
        createdAt: venue.createdAt,
        seatConfig: venue.seatConfig || null
      }
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch venue' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { name, address, city, state, capacity, image, seatingLayoutImage } = await request.json();
    
    if (!name || !address || !city || !state || !capacity) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (image && !image.match(/^data:image\/(png|jpg|jpeg|svg\+xml);base64,/)) {
      return NextResponse.json({ success: false, error: 'Invalid image format. Only PNG, JPG, JPEG, and SVG are allowed' }, { status: 400 });
    }

    if (seatingLayoutImage && !seatingLayoutImage.match(/^data:image\/(png|jpg|jpeg|svg\+xml);base64,/)) {
      return NextResponse.json({ success: false, error: 'Invalid seating layout image format. Only PNG, JPG, JPEG, and SVG are allowed' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const result = await db.collection('venues').updateOne(
      { _id: new ObjectId(params.id) },
      { 
        $set: {
          name,
          location: { address, city, state },
          capacity: parseInt(capacity),
          image: image || null,
          seatingLayoutImage: seatingLayoutImage || null,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update venue' }, { status: 500 });
  }
}
