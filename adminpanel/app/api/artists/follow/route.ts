import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { 
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body = await request.json();
    console.log('Follow request body:', body);
    
    const artistId = body.artistId || body.artist_id;
    const userId = body.userId || body.user_id || '507f1f77bcf86cd799439011';
    const action = body.action || 'follow';

    if (!artistId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Artist ID is required' 
      }, { status: 400 });
    }

    const artistObjectId = new ObjectId(artistId);
    const userObjectId = new ObjectId(userId);

    if (action === 'follow') {
      await db.collection('artists').updateOne(
        { _id: artistObjectId },
        { $addToSet: { followers: userObjectId } }
      );
    } else if (action === 'unfollow') {
      await db.collection('artists').updateOne(
        { _id: artistObjectId },
        { $pull: { followers: userObjectId } }
      );
    }

    // Get updated artist and sync follower count
    const updatedArtist = await db.collection('artists').findOne({ _id: artistObjectId });
    const actualCount = updatedArtist?.followers?.length || 0;
    
    // Fix follower count if it doesn't match actual followers array
    if (updatedArtist && updatedArtist.followersCount !== actualCount) {
      await db.collection('artists').updateOne(
        { _id: artistObjectId },
        { $set: { followersCount: actualCount } }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      followersCount: actualCount,
      message: `Successfully ${action}ed artist`
    });

  } catch (error) {
    console.error('Error updating follow status:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update follow status' 
    }, { status: 500 });
  }
}