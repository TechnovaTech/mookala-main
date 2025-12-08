import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, otp } = await request.json();

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const user = await db.collection('users').findOne({ phone, status: 'pending' });
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    if (otp !== '1234') {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    // Update user status to verified
    await db.collection('users').updateOne(
      { phone },
      { 
        $set: { status: 'verified' },
        $unset: { otp: 1 }
      }
    );

    return NextResponse.json({ 
      success: true, 
      message: 'OTP verified successfully' 
    });
  } catch (error) {
    return NextResponse.json({ error: 'OTP verification failed' }, { status: 500 });
  }
}