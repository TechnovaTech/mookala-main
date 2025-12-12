import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const ads = await db.collection('ads').find({}).sort({ createdAt: -1 }).toArray();
    
    return NextResponse.json({ 
      success: true, 
      ads: ads.map(a => ({
        _id: a._id.toString(),
        title: a.title,
        image: a.image,
        mediaType: a.mediaType || 'image',
        link: a.link || '',
        sponsor: a.sponsor,
        startDate: a.startDate,
        endDate: a.endDate,
        duration: a.duration || 0,
        order: a.order || 1,
        status: a.status || 'active',
        createdAt: a.createdAt
      }))
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch ads' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, image, mediaType, link, sponsor, startDate, endDate, duration, order } = await request.json();
    
    if (!title || !image || !sponsor || !startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const result = await db.collection('ads').insertOne({
      title,
      image,
      mediaType: mediaType || 'image',
      link: link || '',
      sponsor,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      duration: duration || 0,
      order: order || 1,
      status: 'active',
      createdAt: new Date()
    });

    return NextResponse.json({ success: true, adId: result.insertedId });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add ad' }, { status: 500 });
  }
}
