import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, name, email, city, profileImage } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const user = await db.collection('organizers').findOne({ phone });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    const updateData: any = { updatedAt: new Date() };
    
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (city) updateData.city = city;
    if (profileImage) updateData.profileImage = profileImage;
    
    updateData.status = 'profile_completed';
    
    await db.collection('organizers').updateOne(
      { phone },
      { $set: updateData }
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully' 
    });
  } catch (error) {
    return NextResponse.json({ error: 'Profile update failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const user = await db.collection('organizers').findOne({ phone });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      user: {
        phone: user.phone,
        name: user.name || '',
        email: user.email || '',
        city: user.city || '',
        profileImage: user.profileImage || null,
        status: user.status || 'pending',
        kycStatus: user.kycStatus || 'pending'
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}