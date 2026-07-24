import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

// GET /api/jatra                     -> all jatra registrations (admin)
// GET /api/jatra?organizerPhone=xxx  -> a single organizer's registrations
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const organizerPhone = searchParams.get('organizerPhone');

    const query: Record<string, unknown> = {};
    if (organizerPhone) query.organizerPhone = organizerPhone;

    const jatras = await db
      .collection('jatras')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      jatras: jatras.map((j) => ({
        _id: j._id.toString(),
        name: j.name || '',
        venue: j.venue || '',
        date: j.date || '',
        time: j.time || '',
        description: j.description || '',
        artists: j.artists || [],
        committeeMembers: j.committeeMembers || [],
        organizerPhone: j.organizerPhone || '',
        status: j.status || 'pending',
        createdAt: j.createdAt,
      })),
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch jatra registrations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, venue, date, time, description, artists, committeeMembers, organizerPhone } =
      await request.json();

    if (!name || !organizerPhone) {
      return NextResponse.json(
        { success: false, error: 'name and organizerPhone are required' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const result = await db.collection('jatras').insertOne({
      name,
      venue: venue || '',
      date: date || '',
      time: time || '',
      description: description || '',
      artists: Array.isArray(artists) ? artists : [],
      committeeMembers: Array.isArray(committeeMembers) ? committeeMembers : [],
      organizerPhone,
      status: 'pending',
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      jatraId: result.insertedId,
      message: 'Jatra registered successfully. Awaiting admin approval.',
    });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register jatra' },
      { status: 500 }
    );
  }
}
