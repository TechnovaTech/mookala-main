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
    
    // Check for verified users in both collections
    const artist = await db.collection('artists').findOne({ 
      phone, 
      status: { $in: ['verified', 'completed', 'profile_completed'] }
    });
    const organizer = await db.collection('organizers').findOne({ 
      phone, 
      status: { $in: ['verified', 'completed', 'profile_completed'] }
    });
    
    if (artist) {
      return NextResponse.json({ 
        exists: true, 
        role: 'artist',
        user: { 
          phone: artist.phone, 
          _id: artist._id,
          status: artist.status,
          name: artist.name || null
        }
      });
    }
    
    if (organizer) {
      return NextResponse.json({ 
        exists: true, 
        role: 'organizer',
        user: { 
          phone: organizer.phone, 
          _id: organizer._id,
          status: organizer.status,
          name: organizer.name || null
        }
      });
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    return NextResponse.json({ error: 'Check user failed' }, { status: 500 });
  }
}