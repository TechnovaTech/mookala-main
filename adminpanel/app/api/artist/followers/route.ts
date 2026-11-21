import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { requireAppUser } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * GET /api/artist/followers?phone=<artist phone>
 * The customers who follow this artist (users.followedArtists holds the artist id).
 */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, new URL(request.url).searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();

    const artist = await db
      .collection('artists')
      .findOne({ phone: auth.phone }, { projection: { _id: 1, followersCount: 1 } });
    if (!artist) return fail('Artist not found', 404);

    const followers = await db
      .collection('users')
      .find({ followedArtists: artist._id })
      .project({ name: 1, phone: 1, city: 1, profileImage: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .toArray();

    if (artist.followersCount !== followers.length) {
      await db.collection('artists').updateOne({ _id: artist._id }, { $set: { followersCount: followers.length } });
    }

    return ok({
      count: followers.length,
      followers: followers.map((u) => ({
        _id: u._id.toString(),
        name: u.name || 'Mookalaa User',
        phone: u.phone || '',
        city: u.city || '',
        profileImage: u.profileImage || '',
        isVerified: Boolean(u.name) && Boolean(u.city),
        followedDate: u.createdAt || null,
      })),
    });
  } catch (error) {
    console.error('Error fetching artist followers:', error);
    return fail('Failed to fetch followers', 500);
  }
}
