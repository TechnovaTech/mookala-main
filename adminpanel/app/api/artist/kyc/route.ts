import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, aadharId, panId, aadharImage, panImage } = await request.json();

    if (!phone || !aadharId || !panId) {
      return NextResponse.json({ error: 'Phone, Aadhar ID, and PAN ID are required' }, { status: 400 });
    }

    await client.connect();
    const db = client.db('mookalaa');
    const artists = db.collection('artists');

    const updateData: any = {
      aadharId,
      panId,
      kycStatus: 'pending',
      rejectionNotes: '',
      updatedAt: new Date()
    };

    if (aadharImage) {
      updateData.aadharImage = aadharImage;
    }

    if (panImage) {
      updateData.panImage = panImage;
    }

    const result = await artists.updateOne(
      { phone },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'KYC documents submitted successfully' });

  } catch (error) {
    console.error('Error submitting artist KYC:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await client.close();
  }
}