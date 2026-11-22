import { NextRequest, NextResponse } from 'next/server';
import { requireAppUser } from '@/lib/app-auth';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { asString } from '@/lib/http';
import { maintenanceBlock } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

// GET /api/jatra?organizerPhone=xxx  -> one organiser's registrations (organiser app, no login)
// GET /api/jatra                     -> every registration (admin with events:view only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizerPhone = asString(searchParams.get('organizerPhone'), 30);

    const query: Record<string, unknown> = {};
    if (organizerPhone) {
      const gate = requireAppUser(request, organizerPhone);
      if (!gate.ok) return gate.response;
      query.organizerPhone = organizerPhone;
    } else {
      const check = await requireAdmin(request, 'events:view');
      if (!check.ok) return check.response;
    }

    const { db } = await connectToDatabase();
    const jatras = await db.collection('jatras').find(query).sort({ createdAt: -1 }).limit(1000).toArray();

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
        rejectionReason: j.rejectionReason || '',
        reviewedAt: j.reviewedAt || null,
        createdAt: j.createdAt,
      })),
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch jatra registrations' }, { status: 500 });
  }
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 100);
}

export async function POST(request: NextRequest) {
  try {
    const down = await maintenanceBlock(); if (down) return down;
    const body = await request.json().catch(() => null);
    const name = asString(body?.name, 300);
    const organizerPhone = asString(body?.organizerPhone, 30);

    if (!name || !organizerPhone) {
      return NextResponse.json({ success: false, error: 'name and organizerPhone are required' }, { status: 400 });
    }
    const gate = requireAppUser(request, organizerPhone);
    if (!gate.ok) return gate.response;

    const { db } = await connectToDatabase();

    // A registration is always created as pending; only an admin can decide it.
    const result = await db.collection('jatras').insertOne({
      name,
      venue: asString(body.venue, 300),
      date: asString(body.date, 40),
      time: asString(body.time, 40),
      description: asString(body.description, 5000),
      artists: textList(body.artists),
      committeeMembers: textList(body.committeeMembers),
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
    return NextResponse.json({ success: false, error: 'Failed to register jatra' }, { status: 500 });
  }
}
