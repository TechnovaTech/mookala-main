import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** GET /api/artists/follower-count?artistId=<artist id or phone>   Public: a count only. */
export async function GET(request: NextRequest) {
  const artistId = (new URL(request.url).searchParams.get('artistId') || '').trim();
  if (!artistId) return fail('Artist ID is required', 400);

  try {
    const { db } = await connectToDatabase();

    const oid = toObjectId(artistId);
    const artist = await db
      .collection('artists')
      .findOne(oid ? { _id: oid } : { phone: artistId }, { projection: { _id: 1, followersCount: 1 } });
    if (!artist) return fail('Artist not found', 404);

    const followerCount = await db.collection('users').countDocuments({ followedArtists: artist._id });
    if (artist.followersCount !== followerCount) {
      await db.collection('artists').updateOne({ _id: artist._id }, { $set: { followersCount: followerCount } });
    }

    return ok({ followerCount });
  } catch (error) {
    console.error('Error getting follower count:', error);
    return fail('Failed to get follower count', 500);
  }
}
