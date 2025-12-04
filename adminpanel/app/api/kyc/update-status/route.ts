import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, status, role } = await request.json();

    if (!phone || !status || !role) {
      return NextResponse.json({ error: 'Phone, status, and role required' }, { status: 400 });
    }

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (!['artist', 'organizer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const collection = role === 'artist' ? 'artists' : 'organizers';
    const result = await db.collection(collection).updateOne(
      { phone },
      { 
        $set: { 
          kycStatus: status,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: `${role} not found` }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `KYC status updated to ${status}` 
    });
  } catch (error) {
    console.error('Error updating KYC status:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update KYC status' 
    }, { status: 500 });
  }
}