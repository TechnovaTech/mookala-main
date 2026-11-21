import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminWith, requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString } from '@/lib/http';
import { mediaProblem } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

const TYPES = ['photographer', 'videographer'];

// GET /api/professionals                    -> active professionals (the user app, no login)
// GET /api/professionals?type=photographer  -> filter by type (photographer | videographer)
// An admin with hire:view also receives inactive professionals.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = asString(searchParams.get('type'), 30);

    const query: Record<string, unknown> = {};
    if (type) query.type = type;
    if (!isAdminWith(request, 'hire:view')) query.status = { $ne: 'inactive' };

    const { db } = await connectToDatabase();
    const professionals = await db.collection('professionals').find(query).sort({ createdAt: -1 }).toArray();

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
    return NextResponse.json({ success: false, error: 'Failed to fetch professionals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'hire:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });

    const name = asString(body.name, 200);
    const type = asString(body.type, 30);

    if (!name || !type) {
      return NextResponse.json({ success: false, error: 'Name and type are required' }, { status: 400 });
    }
    if (!TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: 'type must be photographer or videographer' }, { status: 400 });
    }

    const portfolio = asString(body.portfolio, 2000);
    if (portfolio && !/^https?:\/\//i.test(portfolio)) {
      return NextResponse.json({ success: false, error: 'Portfolio link must start with http:// or https://' }, { status: 400 });
    }

    const problem = mediaProblem(body.image, 'Photo');
    if (problem) return problem;

    const { db } = await connectToDatabase();
    const doc = {
      name,
      type,
      phone: asString(body.phone, 30),
      city: asString(body.city, 100),
      price: asString(body.price, 100),
      image: typeof body.image === 'string' ? body.image : '',
      bio: asString(body.bio, 5000),
      portfolio,
      experience: asString(body.experience, 100),
      status: body.status === 'inactive' ? 'inactive' : 'active',
      createdAt: new Date(),
      createdBy: check.admin.email || null,
    };
    const result = await db.collection('professionals').insertOne(doc);

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'hire',
      entityType: 'professional',
      entityId: String(result.insertedId),
      entityLabel: name,
      after: doc,
      request,
    });

    return NextResponse.json({ success: true, professionalId: result.insertedId });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add professional' }, { status: 500 });
  }
}
