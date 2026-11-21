import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import {
  MAX_MEDIA_BYTES,
  MEDIA_TOO_LARGE,
  UNVERIFIED_ERROR,
  base64Bytes,
  imageText,
  mediaTypeOf,
  phoneVerified,
  readBody,
  requireAppUser,
  text,
} from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/artist/profile
 *   { phone, name?, email?, city?, bio?, genre?, pricing?, profileImage?, bannerImage?, mediaData?, mediaType? }
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  const auth = requireAppUser(request, body.phone);
  if (!auth.ok) return auth.response;
  const phone = auth.phone;

  try {
    const { db } = await connectToDatabase();

    const artist = await db.collection('artists').findOne({ phone }, { projection: { status: 1 } });
    if (!artist) return fail('User not found', 400);
    if (!phoneVerified(artist)) return fail(UNVERIFIED_ERROR, 403);

    const restricted = await restrictionFor(db, 'artists', phone);
    if (restricted) return fail(restricted, 403);

    const now = new Date();
    const set: Record<string, any> = { updatedAt: now, status: 'completed' };
    const fields: [string, number][] = [
      ['name', 120],
      ['email', 200],
      ['city', 120],
      ['bio', 3000],
      ['genre', 200],
      ['pricing', 200],
    ];
    for (const [key, max] of fields) {
      // Pricing has been sent both as text and as a number.
      const value = typeof body[key] === 'number' ? String(body[key]) : text(body[key], max);
      if (value) set[key] = value;
    }
    const profileImage = imageText(body.profileImage);
    const bannerImage = imageText(body.bannerImage);
    if (profileImage) set.profileImage = profileImage;
    if (bannerImage) set.bannerImage = bannerImage;

    const update: Record<string, any> = { $set: set };
    const mediaData = imageText(body.mediaData);
    const mediaType = mediaTypeOf(body.mediaType);
    if (mediaData && body.mediaType) {
      if (!mediaType) return fail('mediaType must be image or video', 400);
      if (base64Bytes(mediaData) > MAX_MEDIA_BYTES) return fail(MEDIA_TOO_LARGE, 413);
      update.$push = { media: { data: mediaData, type: mediaType, uploadedAt: now, reviewStatus: 'pending' } };
    }

    await db.collection('artists').updateOne({ phone }, update);
    return ok({ message: 'Artist profile updated successfully' });
  } catch (error) {
    console.error('Artist profile update error:', error);
    return fail('Profile update failed', 500);
  }
}

/** GET /api/artist/profile?phone= */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, new URL(request.url).searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();
    const user = await db.collection('artists').findOne({ phone: auth.phone });
    if (!user) return fail('User not found', 404);

    return ok({
      user: {
        phone: user.phone,
        name: user.name || '',
        email: user.email || '',
        city: user.city || '',
        bio: user.bio || '',
        genre: user.genre || '',
        pricing: user.pricing || '',
        profileImage: user.profileImage || null,
        bannerImage: user.bannerImage || null,
        media: user.media || [],
        status: user.status || 'pending',
      },
    });
  } catch (error) {
    console.error('Artist profile error:', error);
    return fail('Failed to fetch profile', 500);
  }
}
