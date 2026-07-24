import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

// GET /api/artist/followers?phone=<artist phone>
// Returns the real list of users who follow this artist (users.followedArtists contains artist._id)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ success: false, error: 'phone is required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const artist = await db.collection('artists').findOne({ phone });
    if (!artist) {
      return NextResponse.json({ success: false, error: 'Artist not found' }, { status: 404 });
    }

    const followers = await db
      .collection('users')
      .find({ followedArtists: artist._id })
      .sort({ createdAt: -1 })
      .toArray();

    // keep the stored count in sync
    if (artist.followersCount !== followers.length) {
      await db.collection('artists').updateOne(
        { _id: artist._id },
        { $set: { followersCount: followers.length } }
      );
    }

    return NextResponse.json({
      success: true,
      count: followers.length,
      followers: followers.map((u) => ({
        _id: u._id.toString(),
        name: u.name || 'Mookalaa User',
        phone: u.phone || '',
        city: u.city || '',
        profileImage: u.profileImage || '',
        isVerified: !!u.name && !!u.city, // treat completed-profile users as "verified"
        followedDate: u.createdAt || null,
      })),
    });
  } catch (error) {
    console.error('Error fetching artist followers:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch followers' },
      { status: 500 }
    );
  }
}
