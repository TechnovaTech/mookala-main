import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok, toObjectId } from '@/lib/http';
import { requireAppUser } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** GET /api/user/follow-status?artistId=<artist id or phone>&userPhone= */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artistId = (searchParams.get('artistId') || '').trim();
  if (!artistId || !searchParams.get('userPhone')) return fail('Artist ID and user phone are required', 400);

  const auth = requireAppUser(request, searchParams.get('userPhone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();

    // An artist is addressed by its id or, failing that, by its phone.
    const oid = toObjectId(artistId);
    const artist = await db
      .collection('artists')
      .findOne(oid ? { _id: oid } : { phone: artistId }, { projection: { _id: 1 } });
    if (!artist) return fail('Artist not found', 404);

    const following = await db
      .collection('users')
      .findOne({ phone: auth.phone, followedArtists: artist._id }, { projection: { _id: 1 } });

    return ok({ isFollowing: Boolean(following) });
  } catch (error) {
    console.error('Error checking follow status:', error);
    return fail('Failed to check follow status', 500);
  }
}
