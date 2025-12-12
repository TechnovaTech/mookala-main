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

    // Count real followers from users collection
    const realFollowersCount = await db.collection('users')
      .countDocuments({ 
        'followedArtists': artist._id
      });
    
    // Update followersCount if it doesn't match
    if (artist.followersCount !== realFollowersCount) {
      await db.collection('artists').updateOne(
        { _id: artist._id },
        { $set: { followersCount: realFollowersCount } }
      );
    }

    // Get booking requests count
    const bookingRequestsCount = await db.collection('events')
      .countDocuments({ 
        'requestedArtists': artist._id,
        'status': { $in: ['pending', 'requested'] }
      });

    // Get upcoming events count
    const upcomingEventsCount = await db.collection('events')
      .countDocuments({ 
        'acceptedArtists': artist._id,
        'date': { $gte: new Date() }
      });

    // Get basic stats
    const stats = {
      followers: realFollowersCount,
      bookingRequests: bookingRequestsCount,
      upcomingEvents: upcomingEventsCount,
      totalEarnings: artist.totalEarnings || 0
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