import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get('all') === 'true';

    // Public callers (the apps, and anything else without ?all=true) only see
    // artists the admin has actually approved. Without this every account was
    // listed the moment it registered — including profiles still waiting on
    // KYC, which were bookable by users before anyone had checked their ID.
    // The admin panel passes ?all=true because it needs the pending ones to
    // review them.
    const query = includeAll ? {} : { kycStatus: 'approved' };

    const artists = await db.collection('artists')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      artists: artists,
      count: artists.length
    });
  } catch (error) {
    console.error('Error fetching artists:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch artists' 
    }, { status: 500 });
  }
}