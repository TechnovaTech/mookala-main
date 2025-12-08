import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, aadharId, panId, aadharImage, panImage } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const user = await db.collection('organizers').findOne({ phone });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    const updateData: any = { 
      updatedAt: new Date(),
      kycStatus: 'pending',
      status: 'profile_completed'
    };
    
    if (aadharId) updateData.aadharId = aadharId;
    if (panId) updateData.panId = panId;
    if (aadharImage) updateData.aadharImage = aadharImage;
    if (panImage) updateData.panImage = panImage;
    
    await db.collection('organizers').updateOne(
      { phone },
      { $set: updateData }
    );

    return NextResponse.json({ 
      success: true, 
      message: 'KYC documents submitted successfully' 
    });
  } catch (error) {
    return NextResponse.json({ error: 'KYC update failed' }, { status: 500 });
  }
}