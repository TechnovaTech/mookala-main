import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    console.log('User registration request for phone:', phone);

    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Valid 10-digit phone number required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Check if user exists
    const existingUser = await db.collection('users').findOne({ phone });
    
    if (existingUser) {
      console.log('Existing user found, updating OTP');
      // User exists, update OTP for re-sending
      await db.collection('users').updateOne(
        { phone },
        { $set: { otp: '1234', updatedAt: new Date() } }
      );
      
      return NextResponse.json({ 
        success: true, 
        message: 'OTP sent successfully',
        otp: '1234',
        isExisting: true
      });
    }

    console.log('New user, creating record');
    // New user - store phone with pending status
    await db.collection('users').insertOne({
      phone,
      status: 'pending',
      otp: '1234',
      createdAt: new Date()
    });

    console.log('User created successfully');

    return NextResponse.json({ 
      success: true, 
      message: 'OTP sent successfully',
      otp: '1234',
      isExisting: false
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}