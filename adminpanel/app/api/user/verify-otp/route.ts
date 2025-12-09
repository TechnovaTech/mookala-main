import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, otp } = await request.json();

    console.log('OTP verification request:', { phone, otp });

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP required' }, { status: 400 });
    }

    if (otp !== '1234') {
      console.log('Invalid OTP provided');
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Check if user exists
    const existingUser = await db.collection('users').findOne({ phone });
    console.log('User exists:', !!existingUser);
    
    if (existingUser) {
      // User exists, only update if not already completed
      console.log('Updating existing user to verified');
      if (existingUser.status !== 'completed') {
        await db.collection('users').updateOne(
          { phone },
          { 
            $set: { status: 'verified', updatedAt: new Date() },
            $unset: { otp: 1 }
          }
        );
      } else {
        // Just remove OTP, keep completed status
        await db.collection('users').updateOne(
          { phone },
          { 
            $set: { updatedAt: new Date() },
            $unset: { otp: 1 }
          }
        );
      }
    } else {
      // New user, create with verified status
      console.log('Creating new user with verified status');
      await db.collection('users').insertOne({
        phone,
        status: 'verified',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    console.log('OTP verification successful for:', phone);

    // Get updated user to check profile completion
    const updatedUser = await db.collection('users').findOne({ phone });
    const isProfileComplete = updatedUser?.status === 'completed' && !!updatedUser?.name;

    console.log('Profile check:', { 
      status: updatedUser?.status, 
      hasName: !!updatedUser?.name, 
      isProfileComplete 
    });

    return NextResponse.json({ 
      success: true, 
      message: 'OTP verified successfully',
      isNewUser: !existingUser,
      isProfileComplete: isProfileComplete,
      user: {
        phone: updatedUser?.phone,
        status: updatedUser?.status,
        name: updatedUser?.name
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return NextResponse.json({ error: 'OTP verification failed' }, { status: 500 });
  }
}