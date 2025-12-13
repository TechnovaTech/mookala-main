import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { seatConfig, totalSeats } = await request.json();
    
    if (!seatConfig) {
      return NextResponse.json({ success: false, error: 'Seat configuration is required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const result = await db.collection('venues').updateOne(
      { _id: new ObjectId(params.id) },
      { 
        $set: { 
          seatConfig,
          capacity: totalSeats || 0,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update seat configuration' }, { status: 500 });
  }
}
