import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { phone, name, email, city, bio, genre, pricing, profileImage, bannerImage, mediaData, mediaType } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    
    const user = await db.collection('artists').findOne({ phone });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    const updateData: any = { 
      updatedAt: new Date(),
      status: 'completed'
    };
    
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (city) updateData.city = city;
    if (bio) updateData.bio = bio;
    if (genre) updateData.genre = genre;
    if (pricing) updateData.pricing = pricing;
    if (profileImage) updateData.profileImage = profileImage;
    if (bannerImage) updateData.bannerImage = bannerImage;
    
    if (mediaData && mediaType) {
      const mediaItem = {
        data: mediaData,
        type: mediaType,
        uploadedAt: new Date()
      };
      updateData.$push = { media: mediaItem };
    }
    
    if (updateData.$push) {
      const { $push, ...setData } = updateData;
      await db.collection('artists').updateOne(
        { phone },
        { $set: setData, $push }
      );
    } else {
      await db.collection('artists').updateOne(
        { phone },
        { $set: updateData }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Artist profile updated successfully' 
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
    const user = await db.collection('artists').findOne({ phone });

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
        bio: user.bio || '',
        genre: user.genre || '',
        pricing: user.pricing || '',
        profileImage: user.profileImage || null,
        bannerImage: user.bannerImage || null,
        media: user.media || [],
        status: user.status || 'pending'
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}