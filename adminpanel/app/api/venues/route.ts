import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminWith, requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, escapeRegex } from '@/lib/http';
import { mediaProblem, readAmenities } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/venues            -> venue list. The apps (no login) receive active venues only.
 * GET /api/venues?name=xxx   -> exact name match, any status (the apps resolve a booked event's venue this way).
 * An admin with venues:view receives every venue.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = (searchParams.get('name') || '').slice(0, 200);
    const isAdmin = isAdminWith(request, 'venues:view');

    const query: Record<string, any> = {};
    if (name) query.name = { $regex: `^${escapeRegex(name)}$`, $options: 'i' };
    else if (!isAdmin) query.status = { $ne: 'inactive' };

    const { db } = await connectToDatabase();
    const venues = await db.collection('venues').find(query).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({
      success: true,
      venues: venues.map((v) => ({
        _id: v._id.toString(),
        name: v.name,
        location: v.location,
        capacity: v.capacity,
        amenities: v.amenities || [],
        status: v.status || 'active',
        image: v.image || null,
        seatingLayoutImage: v.seatingLayoutImage || null,
        seatConfig: v.seatConfig || null,
        createdAt: v.createdAt,
      })),
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch venues' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'venues:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });

    const name = asString(body.name, 200);
    const address = asString(body.address, 500);
    const city = asString(body.city, 100);
    const state = asString(body.state, 100);

    if (!name || !address || !city || !state) {
      return NextResponse.json({ success: false, error: 'Name, address, city and state are required' }, { status: 400 });
    }

    const problem = mediaProblem(body.image, 'Venue image') || mediaProblem(body.seatingLayoutImage, 'Seating layout image');
    if (problem) return problem;

    const { db } = await connectToDatabase();

    const duplicate = await db
      .collection('venues')
      .findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }, { projection: { _id: 1 } });
    if (duplicate) {
      return NextResponse.json(
        { success: false, error: `A venue named "${name}" already exists. The apps find venues by name, so names must be unique.` },
        { status: 409 }
      );
    }

    const doc = {
      name,
      location: { address, city, state },
      capacity: 0,
      image: body.image || null,
      seatingLayoutImage: body.seatingLayoutImage || null,
      status: 'active',
      amenities: readAmenities(body.amenities),
      createdAt: new Date(),
      createdBy: check.admin.email || null,
    };
    const result = await db.collection('venues').insertOne(doc);

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'venues',
      entityType: 'venue',
      entityId: String(result.insertedId),
      entityLabel: name,
      after: doc,
      request,
    });

    return NextResponse.json({ success: true, venueId: result.insertedId });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to add venue' }, { status: 500 });
  }
}
