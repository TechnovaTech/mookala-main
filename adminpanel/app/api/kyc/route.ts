import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    
    const kycRecords = await db.collection('organizers')
      .find({ 
        kycStatus: { $exists: true },
        aadharId: { $exists: true },
        panId: { $exists: true }
      })
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json({ 
      success: true, 
      kycRecords: kycRecords,
      count: kycRecords.length
    });
  } catch (error) {
    console.error('Error fetching KYC records:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch KYC records' 
    }, { status: 500 });
  }
}