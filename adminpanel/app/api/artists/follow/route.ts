import { NextRequest, NextResponse } from 'next/server';
import { maintenanceBlock } from '@/lib/maintenance';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok, toObjectId } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import { readBody, requireAppUser, text } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/artists/follow
 *   { artistId: <artist id or phone>, userPhone, action?: 'follow' | 'unfollow' }
 */
export async function POST(request: NextRequest) {
  // Refused while the platform is under maintenance (see lib/maintenance.ts).
  const down = await maintenanceBlock(); if (down) return down;
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  const artistId = text(body.artistId, 40);
  if (!artistId || !body.userPhone) return fail('Artist ID and user phone are required', 400);

  const action = body.action === undefined || body.action === null ? 'follow' : body.action;
  if (action !== 'follow' && action !== 'unfollow') return fail('Action must be follow or unfollow', 400);

  const auth = requireAppUser(request, body.userPhone);
  if (!auth.ok) return auth.response;
  const userPhone = auth.phone;

  try {
    const { db } = await connectToDatabase();

    // An artist is addressed by its id or, failing that, by its phone.
    const oid = toObjectId(artistId);
    const artist = await db
      .collection('artists')
      .findOne(oid ? { _id: oid } : { phone: artistId }, { projection: { _id: 1 } });
    if (!artist) return fail('Artist not found', 404);

    const users = db.collection('users');
    const user = await users.findOne({ phone: userPhone }, { projection: { followedArtists: 1 } });
    if (!user) return fail('User not found', 404);

    const restricted = await restrictionFor(db, 'users', userPhone);
    if (restricted) return fail(restricted, 403);

    const followingNow =
      Array.isArray(user.followedArtists) && user.followedArtists.some((id: any) => String(id) === String(artist._id));
    const count = () => users.countDocuments({ followedArtists: artist._id });

    if (action === 'follow' && followingNow) {
      return ok({ followerCount: await count(), isFollowing: true, message: 'Already following this artist' });
    }
    if (action === 'unfollow' && !followingNow) {
      return ok({ followerCount: await count(), isFollowing: false, message: 'Not following this artist' });
    }

    if (action === 'follow') {
      await users.updateOne({ phone: userPhone }, { $addToSet: { followedArtists: artist._id } });
    } else {
      await users.updateOne({ phone: userPhone }, { $pull: { followedArtists: artist._id } } as any);
    }

    const followerCount = await count();
    await db.collection('artists').updateOne({ _id: artist._id }, { $set: { followersCount: followerCount } });

    return ok({
      followerCount,
      isFollowing: action === 'follow',
      message: `Successfully ${action}ed artist`,
    });
  } catch (error) {
    console.error('Error updating follow status:', error);
    return fail('Failed to update follow status', 500);
  }
}
