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
    
    const artistId = body.artistId;
    const userPhone = body.userPhone;
    const action = body.action || 'follow';

    if (!artistId || !userPhone) {
      return NextResponse.json({ 
        success: false, 
        error: 'Artist ID and user phone are required' 
      }, { status: 400 });
    }

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

    const artistObjectId = artist._id;

    // Check current follow status to prevent duplicates
    const existingUser = await db.collection('users').findOne({
      phone: userPhone,
      followedArtists: artistObjectId
    });

    const isCurrentlyFollowing = !!existingUser;

    // Prevent duplicate operations
    if (action === 'follow' && isCurrentlyFollowing) {
      const followerCount = await db.collection('users')
        .countDocuments({ 'followedArtists': artistObjectId });
      return NextResponse.json({ 
        success: true, 
        followerCount: followerCount,
        message: 'Already following this artist'
      });
    }

    if (action === 'unfollow' && !isCurrentlyFollowing) {
      const followerCount = await db.collection('users')
        .countDocuments({ 'followedArtists': artistObjectId });
      return NextResponse.json({ 
        success: true, 
        followerCount: followerCount,
        message: 'Not following this artist'
      });
    }

    // Update user's followedArtists array
    if (action === 'follow') {
      await db.collection('users').updateOne(
        { phone: userPhone },
        { $addToSet: { followedArtists: artistObjectId } },
        { upsert: true }
      );
    } else if (action === 'unfollow') {
      await db.collection('users').updateOne(
        { phone: userPhone },
        { $pull: { followedArtists: artistObjectId } } as any
      );
    }

    // Count real followers from users collection
    const followerCount = await db.collection('users')
      .countDocuments({ 
        'followedArtists': artistObjectId
      });
    
    // Update artist's follower count
    await db.collection('artists').updateOne(
      { _id: artistObjectId },
      { $set: { followersCount: followerCount } }
    );
    
    return NextResponse.json({ 
      success: true, 
      followerCount: followerCount,
      isFollowing: action === 'follow',
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