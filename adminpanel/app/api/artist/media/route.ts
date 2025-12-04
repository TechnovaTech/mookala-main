import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, mediaData, mediaType } = await request.json();

    if (!phone || !mediaData || !mediaType) {
      return NextResponse.json({ error: 'Phone, mediaData, and mediaType required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const user = await db.collection('artists').findOne({ phone });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    const mediaItem = {
      data: mediaData,
      type: mediaType,
      uploadedAt: new Date()
    };
    
    await db.collection('artists').updateOne(
      { phone },
      { 
        $push: { media: mediaItem } as any,
        $set: { updatedAt: new Date() }
      }
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Media uploaded successfully' 
    });
  } catch (error) {
    return NextResponse.json({ error: 'Media upload failed' }, { status: 500 });
  }
}