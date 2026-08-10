import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Valid 10-digit phone number required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const existingUser = await db.collection('artists').findOne({ phone });

    if (existingUser) {
      const finished = ['verified', 'completed', 'profile_completed'].includes(existingUser.status);

      // Only a finished profile is a genuine duplicate. A half-finished
      // signup used to be rejected here forever: the number was taken, but
      // check-user did not recognise it, so the phone could never get in.
      // Re-issue the OTP and let them pick up where they left off.
      if (finished) {
        return NextResponse.json({ error: 'Phone number already registered' }, { status: 400 });
      }

      await db.collection('artists').updateOne(
        { phone },
        { $set: { otp: '1234', updatedAt: new Date() } }
      );

      return NextResponse.json({
        success: true,
        message: 'OTP sent successfully',
        otp: '1234',
        resumed: true
      });
    }

    await db.collection('artists').insertOne({
      phone,
      status: 'pending',
      otp: '1234',
      createdAt: new Date()
    });

    return NextResponse.json({ 
      success: true, 
      message: 'OTP sent successfully',
      otp: '1234'
    });
  } catch (error) {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}