import { NextRequest, NextResponse } from 'next/server';
import { isAdminWith, requireAdmin } from '@/lib/auth';
import { requireAppUser } from '@/lib/app-auth';
import { connectToDatabase } from '@/lib/mongodb';
import { asString } from '@/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/hire-requests                 -> all requests (admin with hire:view; enforced by the middleware)
// GET /api/hire-requests?userPhone=xxx   -> one customer's requests
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userPhone = asString(searchParams.get('userPhone'), 30);

    // A customer may list their own requests. Listing everyone's needs an admin.
    if (!isAdminWith(request, 'hire:view')) {
      if (!userPhone) {
        const check = await requireAdmin(request, 'hire:view');
        if (!check.ok) return check.response;
      } else {
        const gate = requireAppUser(request, userPhone);
        if (!gate.ok) return gate.response;
      }
    }

    const query: Record<string, unknown> = {};
    if (userPhone) query.userPhone = userPhone;

    const { db } = await connectToDatabase();
    const requests = await db.collection('hireRequests').find(query).sort({ createdAt: -1 }).limit(2000).toArray();

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
        statusReason: r.statusReason || '',
        updatedAt: r.updatedAt || null,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch hire requests' }, { status: 500 });
  }
}

/** POST /api/hire-requests: sent by the user app (no login) when a customer asks to hire a professional. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const userPhone = asString(body?.userPhone, 30);
    const professionalId = asString(body?.professionalId, 64);

    if (!userPhone || !professionalId) {
      return NextResponse.json({ success: false, error: 'userPhone and professionalId are required' }, { status: 400 });
    }
    const gate = requireAppUser(request, userPhone);
    if (!gate.ok) return gate.response;

    const { db } = await connectToDatabase();

    const result = await db.collection('hireRequests').insertOne({
      professionalId,
      professionalName: asString(body.professionalName, 200),
      type: asString(body.type, 30),
      userPhone,
      userName: asString(body.userName, 200),
      eventDate: asString(body.eventDate, 40),
      city: asString(body.city, 100),
      message: asString(body.message, 2000),
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
    return NextResponse.json({ success: false, error: 'Failed to submit hire request' }, { status: 500 });
  }
}
