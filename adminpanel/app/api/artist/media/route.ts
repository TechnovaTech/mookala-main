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
} from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/artist/media   { phone, mediaData (base64), mediaType: 'image' | 'video' }
 * Media is kept inside the artist document, so it is limited to 3 MB. A new
 * item waits for portfolio review (`reviewStatus: 'pending'`).
 */
export async function POST(request: NextRequest) {
  // base64 is a third larger than the file, plus the rest of the JSON body.
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_MEDIA_BYTES * 1.4 + 4096) return fail(MEDIA_TOO_LARGE, 413);

  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  const mediaData = imageText(body.mediaData);
  if (!body.phone || !mediaData || !body.mediaType) return fail('Phone, mediaData, and mediaType required', 400);

  const auth = requireAppUser(request, body.phone);
  if (!auth.ok) return auth.response;
  const phone = auth.phone;

  const mediaType = mediaTypeOf(body.mediaType);
  if (!mediaType) return fail('mediaType must be image or video', 400);
  if (base64Bytes(mediaData) > MAX_MEDIA_BYTES) return fail(MEDIA_TOO_LARGE, 413);

  try {
    const { db } = await connectToDatabase();

    const artist = await db.collection('artists').findOne({ phone }, { projection: { status: 1 } });
    if (!artist) return fail('User not found', 400);
    if (!phoneVerified(artist)) return fail(UNVERIFIED_ERROR, 403);

    const restricted = await restrictionFor(db, 'artists', phone);
    if (restricted) return fail(restricted, 403);

    const now = new Date();
    await db.collection('artists').updateOne(
      { phone },
      {
        $push: { media: { data: mediaData, type: mediaType, uploadedAt: now, reviewStatus: 'pending' } } as any,
        $set: { updatedAt: now },
      }
    );

    return ok({ message: 'Media uploaded successfully', reviewStatus: 'pending' });
  } catch (error) {
    console.error('Media upload error:', error);
    return fail('Media upload failed', 500);
  }
}
