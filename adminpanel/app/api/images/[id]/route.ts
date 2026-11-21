import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminWith } from '@/lib/auth';
import { toObjectId } from '@/lib/http';
import { isMediaPublic } from '@/app/api/admin/artists/_shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/images/[id]?type=profile|banner|media&index=N
 * Serves an artist's profile photo, banner or one portfolio item.
 *
 * Caching: the URL of a photo does not change when the artist uploads a new
 * one, so the response must not be cached as immutable (it used to be, for a
 * year, and replaced photos stayed stale). Browsers may now keep a copy for a
 * minute and must then revalidate; an ETag made from the image content turns
 * the revalidation into a small 304 when nothing changed.
 *
 * A portfolio item an admin rejected is only served to a signed-in admin.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const oid = toObjectId(params.id);
    if (!oid) return new NextResponse('Not found', { status: 404 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'profile';
    if (!['profile', 'banner', 'media'].includes(type)) return new NextResponse('Not found', { status: 404 });

    let projection: Record<string, any>;
    let index = 0;
    if (type === 'media') {
      const raw = searchParams.get('index');
      index = raw !== null && /^\d{1,4}$/.test(raw) ? parseInt(raw, 10) : -1;
      if (index < 0) return new NextResponse('Image not found', { status: 404 });
      projection = { media: { $slice: [index, 1] } };
    } else {
      projection = type === 'profile' ? { profileImage: 1 } : { bannerImage: 1 };
    }

    const { db } = await connectToDatabase();
    // `$slice` alone would return every other field too, so name the fields.
    const artist = await db
      .collection('artists')
      .findOne({ _id: oid }, { projection: { _id: 1, ...projection, ...(type === 'media' ? { name: 1 } : {}) } });
    if (!artist) return new NextResponse('Not found', { status: 404 });

    let imageData: string | null = null;
    let mediaType = '';
    let restricted = false;

    if (type === 'profile') imageData = artist.profileImage || null;
    else if (type === 'banner') imageData = artist.bannerImage || null;
    else {
      const item = Array.isArray(artist.media) ? artist.media[0] : null;
      if (item && !isMediaPublic(item)) {
        if (!isAdminWith(request, 'artists:view')) return new NextResponse('Image not found', { status: 404 });
        restricted = true;
      }
      imageData = typeof item === 'string' ? item : item?.data || null;
      mediaType = typeof item === 'object' && item ? String(item.type || '') : '';
    }

    if (!imageData || typeof imageData !== 'string') return new NextResponse('Image not found', { status: 404 });

    let buffer: Buffer;
    let mimeType = /video/i.test(mediaType) ? 'video/mp4' : 'image/jpeg';

    if (imageData.startsWith('data:')) {
      const matches = imageData.match(/^data:([^;,]+);base64,([\s\S]+)$/);
      if (!matches) return new NextResponse('Invalid image data', { status: 400 });
      mimeType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(imageData, 'base64');
    }

    // Only ever answer with an image or video type, whatever the stored data claims.
    if (!/^(image|video)\/[a-z0-9.+-]+$/i.test(mimeType) || /svg/i.test(mimeType)) mimeType = 'application/octet-stream';

    const etag = '"' + crypto.createHash('sha1').update(buffer).digest('hex') + '"';
    const headers: Record<string, string> = {
      ETag: etag,
      'Cache-Control': restricted ? 'private, no-store' : 'public, max-age=60, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    };

    if (!restricted && request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers });
    }

    return new NextResponse(buffer as any, { headers: { ...headers, 'Content-Type': mimeType } });
  } catch (error) {
    console.error('Image fetch error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
