import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

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
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ 
        success: false, 
        error: 'Phone number is required' 
      }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Find artist by phone
    const artist = await db.collection('artists').findOne({ phone });
    
    if (!artist) {
      return NextResponse.json({ 
        success: false, 
        error: 'Artist not found' 
      }, { status: 404 });
    }

    // Get real-time follower count
    const realFollowersCount = artist.followers ? artist.followers.length : 0;
    
    // Update followersCount if it doesn't match
    if (artist.followersCount !== realFollowersCount) {
      await db.collection('artists').updateOne(
        { _id: artist._id },
        { $set: { followersCount: realFollowersCount } }
      );
    }

    // Get basic stats
    const stats = {
      totalEvents: 0,
      completedEvents: 0,
      upcomingEvents: 0,
      totalEarnings: 0,
      followersCount: realFollowersCount,
      profileViews: artist.profileViews || 0,
      rating: artist.rating || 0,
      totalReviews: artist.totalReviews || 0
    };

    return NextResponse.json({ 
      success: true, 
      stats,
      artist: {
        _id: artist._id.toString(),
        name: artist.name,
        phone: artist.phone,
        status: artist.status
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch dashboard stats' 
    }, { status: 500 });
  }
}