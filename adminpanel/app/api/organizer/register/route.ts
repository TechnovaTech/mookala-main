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
    
    const existingUser = await db.collection('organizers').findOne({ phone });
    
    if (existingUser) {
      return NextResponse.json({ error: 'Phone number already registered' }, { status: 400 });
    }

    await db.collection('organizers').insertOne({
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