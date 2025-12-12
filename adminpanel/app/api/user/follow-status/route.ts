import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { 
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const artistId = searchParams.get('artistId');
    const userPhone = searchParams.get('userPhone');

    if (!artistId || !userPhone) {
      return NextResponse.json({ 
        success: false, 
        error: 'Artist ID and user phone are required' 
      }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Find the artist
    const artist = await db.collection('artists').findOne({ 
      $or: [
        { _id: new ObjectId(artistId) },
        { phone: artistId }
      ]
    });

    if (!artist) {
      return NextResponse.json({ 
        success: false, 
        error: 'Artist not found' 
      }, { status: 404 });
    }

    // Check if user is following this artist
    const user = await db.collection('users').findOne({
      phone: userPhone,
      followedArtists: artist._id
    });

    return NextResponse.json({ 
      success: true, 
      isFollowing: !!user
    });

  } catch (error) {
    console.error('Error checking follow status:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to check follow status' 
    }, { status: 500 });
  }
}