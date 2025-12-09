import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase();
    const artist = await db.collection('artists').findOne({ _id: new ObjectId(params.id) });
    
    if (!artist) {
      return NextResponse.json({ success: false, error: 'Artist not found' }, { status: 404 });
    }

    // Fetch events where this artist was accepted
    const events = await db.collection('events')
      .find({ 
        'acceptedArtists': new ObjectId(params.id)
      })
      .toArray();

    return NextResponse.json({ 
      success: true, 
      artist: {
        _id: artist._id.toString(),
        phone: artist.phone,
        name: artist.name,
        email: artist.email,
        city: artist.city,
        bio: artist.bio,
        genre: artist.genre,
        pricing: artist.pricing,
        status: artist.status,
        createdAt: artist.createdAt,
        media: artist.media || [],
        events: events.map(e => ({
          id: e._id.toString(),
          name: e.name,
          date: e.date
        }))
      }
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch artist' }, { status: 500 });
  }
}
