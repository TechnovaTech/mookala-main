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
    const organizers = db.collection('organizers');

    const organizer = await organizers.findOne({ phone });

    if (!organizer) {
      return NextResponse.json({ error: 'Organizer not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      kycStatus: organizer.kycStatus || 'pending',
      rejectionNotes: organizer.rejectionNotes || '',
      aadharId: organizer.aadharId || '',
      panId: organizer.panId || ''
    });

  } catch (error) {
    console.error('Error fetching KYC status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await client.close();
  }
}