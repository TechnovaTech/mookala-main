import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, name, email, city, profileImage, genres } = body;

    console.log('Profile update request:', { phone, name, email, city, hasImage: !!profileImage, genres });

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    // Find user by phone (don't require verified status for profile update)
    const user = await db.collection('users').findOne({ phone });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    // Update user profile
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (city) updateData.city = city;
    if (profileImage) updateData.profileImage = profileImage;
    if (genres && genres.length > 0) updateData.genres = genres;
    
    // Mark as completed if any profile data is provided
    updateData.status = 'completed';
    
    await db.collection('users').updateOne(
      { phone },
      { $set: updateData }
    );

    console.log('Profile updated successfully for:', phone);

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully' 
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Profile update failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    console.log('Profile GET request for phone:', phone);

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const user = await db.collection('users').findOne({ phone });

    console.log('User found:', !!user, user ? user.status : 'none');

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
        genres: user.genres || [],
        status: user.status || 'pending'
      }
    });
  } catch (error) {
    console.error('Profile GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}