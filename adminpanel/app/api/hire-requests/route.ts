import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

// GET /api/hire-requests                 -> all requests (admin)
// GET /api/hire-requests?userPhone=xxx   -> a user's own requests
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const userPhone = searchParams.get('userPhone');

    const query: Record<string, unknown> = {};
    if (userPhone) query.userPhone = userPhone;

    const requests = await db
      .collection('hireRequests')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      requests: requests.map((r) => ({
        _id: r._id.toString(),
        professionalId: r.professionalId || '',
        professionalName: r.professionalName || '',
        type: r.type || '',
        userPhone: r.userPhone || '',
        userName: r.userName || '',
        eventDate: r.eventDate || '',
        city: r.city || '',
        message: r.message || '',
        status: r.status || 'pending',
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch hire requests' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      professionalId,
      professionalName,
      type,
      userPhone,
      userName,
      eventDate,
      city,
      message,
    } = await request.json();

    if (!userPhone || !professionalId) {
      return NextResponse.json(
        { success: false, error: 'userPhone and professionalId are required' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const result = await db.collection('hireRequests').insertOne({
      professionalId,
      professionalName: professionalName || '',
      type: type || '',
      userPhone,
      userName: userName || '',
      eventDate: eventDate || '',
      city: city || '',
      message: message || '',
      status: 'pending',
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      requestId: result.insertedId,
      message: 'Hire request submitted successfully',
    });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit hire request' },
      { status: 500 }
    );
  }
}
