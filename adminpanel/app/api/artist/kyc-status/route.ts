import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    await client.connect();
    const db = client.db('mookalaa');
    const artists = db.collection('artists');

    const artist = await artists.findOne({ phone });

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      kycStatus: artist.kycStatus || 'pending',
      rejectionNotes: artist.rejectionNotes || '',
      aadharId: artist.aadharId || '',
      panId: artist.panId || ''
    });

  } catch (error) {
    console.error('Error fetching artist KYC status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await client.close();
  }
}