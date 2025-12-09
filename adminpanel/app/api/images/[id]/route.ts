import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'profile';
    const index = searchParams.get('index');

    const { db } = await connectToDatabase();
    const artist = await db.collection('artists').findOne({ _id: new ObjectId(params.id) });
    
    if (!artist) {
      return new NextResponse('Not found', { status: 404 });
    }

    let imageData: string | null = null;

    if (type === 'profile' && artist.profileImage) {
      imageData = artist.profileImage;
    } else if (type === 'banner' && artist.bannerImage) {
      imageData = artist.bannerImage;
    } else if (type === 'media' && index !== null && artist.media) {
      const mediaItem = artist.media[parseInt(index)];
      imageData = typeof mediaItem === 'string' ? mediaItem : mediaItem?.data;
    }

    if (!imageData) {
      return new NextResponse('Image not found', { status: 404 });
    }

    let buffer: Buffer;
    let mimeType = 'image/jpeg';

    if (imageData.startsWith('data:')) {
      const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        return new NextResponse('Invalid image data', { status: 400 });
      }
    } else {
      buffer = Buffer.from(imageData, 'base64');
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Image fetch error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
