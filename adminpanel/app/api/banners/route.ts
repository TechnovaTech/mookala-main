import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const banners = await db.collection('banners').find({}).sort({ order: 1 }).toArray();
    
    return NextResponse.json({ 
      success: true, 
      banners: banners.map(b => ({
        _id: b._id.toString(),
        title: b.title,
        image: b.image,
        mediaType: b.mediaType || 'image',
        link: b.link || '',
        order: b.order,
        status: b.status || 'active',
        createdAt: b.createdAt
      }))
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch banners' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, image, mediaType, link, order } = await request.json();
    
    if (!title || !image || !order) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const result = await db.collection('banners').insertOne({
      title,
      image,
      mediaType: mediaType || 'image',
      link: link || '',
      order: parseInt(order),
      status: 'active',
      createdAt: new Date()
    });

    return NextResponse.json({ success: true, bannerId: result.insertedId });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add banner' }, { status: 500 });
  }
}
