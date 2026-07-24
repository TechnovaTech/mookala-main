import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

// GET /api/professionals            -> all active professionals
// GET /api/professionals?type=photographer  -> filter by type (photographer | videographer)
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    const query: Record<string, unknown> = {};
    if (type) query.type = type;

    const professionals = await db
      .collection('professionals')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      professionals: professionals.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        type: p.type, // 'photographer' | 'videographer'
        phone: p.phone || '',
        city: p.city || '',
        price: p.price || '',
        image: p.image || '',
        bio: p.bio || '',
        portfolio: p.portfolio || '',
        experience: p.experience || '',
        status: p.status || 'active',
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch professionals' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, type, phone, city, price, image, bio, portfolio, experience } =
      await request.json();

    if (!name || !type) {
      return NextResponse.json(
        { success: false, error: 'Name and type are required' },
        { status: 400 }
      );
    }

    if (type !== 'photographer' && type !== 'videographer') {
      return NextResponse.json(
        { success: false, error: 'type must be photographer or videographer' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const result = await db.collection('professionals').insertOne({
      name,
      type,
      phone: phone || '',
      city: city || '',
      price: price || '',
      image: image || '',
      bio: bio || '',
      portfolio: portfolio || '',
      experience: experience || '',
      status: 'active',
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, professionalId: result.insertedId });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add professional' },
      { status: 500 }
    );
  }
}
