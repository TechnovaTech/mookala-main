import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    const { db } = await connectToDatabase();
    
    let kycRecords;
    
    if (role === 'artist') {
      kycRecords = await db.collection('artists')
        .find({ 
          $or: [
            { aadharId: { $exists: true, $ne: '' } },
            { panId: { $exists: true, $ne: '' } },
            { kycStatus: { $exists: true } }
          ]
        })
        .sort({ updatedAt: -1 })
        .toArray();
    } else {
      kycRecords = await db.collection('organizers')
        .find({ 
          $or: [
            { aadharId: { $exists: true, $ne: '' } },
            { panId: { $exists: true, $ne: '' } },
            { kycStatus: { $exists: true } }
          ]
        })
        .sort({ updatedAt: -1 })
        .toArray();
    }

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