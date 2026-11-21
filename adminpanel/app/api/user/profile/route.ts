import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import { UNVERIFIED_ERROR, imageText, phoneVerified, readBody, requireAppUser, text, base64Bytes, MAX_KYC_IMAGE_BYTES } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** POST /api/user/profile   { phone, name?, email?, city?, profileImage?, genres? } */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  const auth = requireAppUser(request, body.phone);
  if (!auth.ok) return auth.response;
  const phone = auth.phone;

  try {
    const { db } = await connectToDatabase();

    const user = await db.collection('users').findOne({ phone }, { projection: { status: 1 } });
    if (!user) return fail('User not found', 404);
    if (!phoneVerified(user)) return fail(UNVERIFIED_ERROR, 403);

    const restricted = await restrictionFor(db, 'users', phone);
    if (restricted) return fail(restricted, 403);

    const set: Record<string, any> = { updatedAt: new Date(), status: 'completed' };
    const name = text(body.name, 120);
    const email = text(body.email, 200);
    const city = text(body.city, 120);
    const profileImage = imageText(body.profileImage);
    const unset: Record<string, ''> = {};
    if (name) set.name = name;

    // Email, city and photo are optional. A field sent as null or an empty
    // string is cleared; a field that is not sent at all is left as it is.
    if ('email' in body) email ? (set.email = email) : (unset.email = '');
    if ('city' in body) city ? (set.city = city) : (unset.city = '');
    if ('profileImage' in body) {
      if (!profileImage) unset.profileImage = '';
      else if (base64Bytes(profileImage) > MAX_KYC_IMAGE_BYTES) {
        return fail('This photo is too large. Please choose a smaller photo (up to 1.5 MB).', 413);
      } else set.profileImage = profileImage;
    }
    if (Array.isArray(body.genres)) {
      const genres = body.genres.map((g: unknown) => text(g, 60)).filter(Boolean).slice(0, 50);
      if (genres.length > 0) set.genres = genres;
    }

    await db
      .collection('users')
      .updateOne({ phone }, Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set });
    return ok({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    return fail('Profile update failed', 500);
  }
}

/** GET /api/user/profile?phone= */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, new URL(request.url).searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();
    const user = await db.collection('users').findOne({ phone: auth.phone });
    if (!user) return fail('User not found', 404);

    return ok({
      user: {
        phone: user.phone,
        name: user.name || '',
        email: user.email || '',
        city: user.city || '',
        profileImage: user.profileImage || null,
        followedArtists: Array.isArray(user.followedArtists) ? user.followedArtists.map((id: unknown) => String(id)) : [],
        genres: user.genres || [],
        status: user.status || 'pending',
        createdAt: user.createdAt || null,
      },
    });
  } catch (error) {
    console.error('Profile GET error:', error);
    return fail('Failed to fetch profile', 500);
  }
}
