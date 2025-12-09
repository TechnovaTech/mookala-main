import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { seatCategories } = await request.json();
    
    if (!seatCategories) {
      return NextResponse.json({ success: false, error: 'Seat categories are required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const result = await db.collection('venues').updateOne(
      { _id: new ObjectId(params.id) },
      { 
        $set: { 
          seatCategories,
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
    return NextResponse.json({ success: false, error: 'Failed to update seat categories' }, { status: 500 });
  }
}
