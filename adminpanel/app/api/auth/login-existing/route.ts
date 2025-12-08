import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, role } = await request.json();

    if (!phone || !role) {
      return NextResponse.json({ error: 'Phone and role required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const collection = role === 'artist' ? 'artists' : 'organizers';
    const user = await db.collection(collection).findOne({ 
      phone, 
      status: { $in: ['verified', 'completed', 'profile_completed'] }
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found or not verified' }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Login successful',
      user: {
        phone: user.phone,
        role: role,
        status: user.status,
        name: user.name || null
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}