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

    if (!artistId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Artist ID is required' 
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

    // Count real followers from users collection
    const followerCount = await db.collection('users')
      .countDocuments({ 
        'followedArtists': artist._id
      });

    // Update artist's follower count if it's different
    if (artist.followersCount !== followerCount) {
      await db.collection('artists').updateOne(
        { _id: artist._id },
        { $set: { followersCount: followerCount } }
      );
    }

    return NextResponse.json({ 
      success: true, 
      followerCount: followerCount
    });

  } catch (error) {
    console.error('Error getting follower count:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to get follower count' 
    }, { status: 500 });
  }
}