import { NextRequest, NextResponse } from 'next/server';
import type { Db, ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminWith, requireAdmin } from '@/lib/auth';
import { diff, logAudit } from '@/lib/audit';
import { asString, escapeRegex, toObjectId } from '@/lib/http';
import { mediaProblem, readAmenities } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

/** Events that point at a venue, either by its id or by its name. */
function eventsUsingVenue(id: ObjectId, name: string) {
  return { $or: [{ venue: String(id) }, { venue: id }, { venue: name }, { 'location.name': name }] };
}

async function countEvents(db: Db, id: ObjectId, name: string) {
  return name ? db.collection('events').countDocuments(eventsUsingVenue(id, name)) : 0;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid venue id' }, { status: 400 });

    const { db } = await connectToDatabase();
    const venue = await db.collection('venues').findOne({ _id: id });

    if (!venue) {
      return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });
    }

    const result: Record<string, any> = {
      _id: venue._id.toString(),
      name: venue.name,
      location: venue.location,
      capacity: venue.capacity,
      amenities: venue.amenities || [],
      status: venue.status || 'active',
      image: venue.image || null,
      seatingLayoutImage: venue.seatingLayoutImage || null,
      createdAt: venue.createdAt,
      seatConfig: venue.seatConfig || null,
    };

    // Extra detail for the admin panel only.
    if (isAdminWith(request, 'venues:view')) {
      result.updatedAt = venue.updatedAt || null;
      result.statusReason = venue.statusReason || null;
      result.eventCount = await countEvents(db, id, venue.name);
    }

    return NextResponse.json({ success: true, venue: result });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch venue' }, { status: 500 });
  }
}

/**
 * PUT /api/venues/[id]: changes only the fields that were sent. Capacity is
 * never taken from here: it is the total of the seat configuration.
 * Send `image: null` or `seatingLayoutImage: null` to remove a picture.
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'venues:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid venue id' }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });

    const { db } = await connectToDatabase();
    const existing = await db.collection('venues').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });

    const set: Record<string, any> = {};

    if ('name' in body) {
      const name = asString(body.name, 200);
      if (!name) return NextResponse.json({ success: false, error: 'Venue name cannot be empty' }, { status: 400 });
      if (name.toLowerCase() !== String(existing.name || '').toLowerCase()) {
        const duplicate = await db
          .collection('venues')
          .findOne({ _id: { $ne: id }, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }, { projection: { _id: 1 } });
        if (duplicate) return NextResponse.json({ success: false, error: `A venue named "${name}" already exists` }, { status: 409 });
      }
      set.name = name;
    }

    for (const key of ['address', 'city', 'state'] as const) {
      if (!(key in body)) continue;
      const value = asString(body[key], key === 'address' ? 500 : 100);
      if (!value) return NextResponse.json({ success: false, error: `Venue ${key} cannot be empty` }, { status: 400 });
      set[`location.${key}`] = value;
    }

    for (const [key, label] of [['image', 'Venue image'], ['seatingLayoutImage', 'Seating layout image']] as const) {
      if (!(key in body)) continue;
      const problem = mediaProblem(body[key], label);
      if (problem) return problem;
      set[key] = body[key] || null;
    }

    if ('amenities' in body) set.amenities = readAmenities(body.amenities);

    const reason = asString(body.reason, 500);
    if ('status' in body) {
      if (body.status !== 'active' && body.status !== 'inactive') {
        return NextResponse.json({ success: false, error: 'status must be active or inactive' }, { status: 400 });
      }
      if (body.status !== (existing.status || 'active')) {
        if (body.status === 'inactive' && !reason) {
          return NextResponse.json({ success: false, error: 'A reason is required to deactivate a venue' }, { status: 400 });
        }
        set.status = body.status;
        set.statusReason = reason || null;
        set.statusChangedBy = check.admin.email || null;
        set.statusChangedAt = new Date();
      }
    }

    if (Object.keys(set).length === 0) return NextResponse.json({ success: true, unchanged: true });

    set.updatedAt = new Date();
    set.updatedBy = check.admin.email || null;
    await db.collection('venues').updateOne({ _id: id }, { $set: set });

    const updated = await db.collection('venues').findOne({ _id: id });
    const changes = diff(existing, updated);
    await logAudit({
      admin: check.admin,
      action: 'status' in set ? 'status_change' : 'update',
      module: 'venues',
      entityType: 'venue',
      entityId: String(id),
      entityLabel: updated?.name || existing.name,
      before: changes.before,
      after: changes.after,
      reason: reason || null,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update venue' }, { status: 500 });
  }
}

/** DELETE /api/venues/[id]: refused while any event still uses the venue. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'venues:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid venue id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const reason = asString(body?.reason, 500);
    if (!reason) return NextResponse.json({ success: false, error: 'A reason is required to delete a venue' }, { status: 400 });

    const { db } = await connectToDatabase();
    const existing = await db.collection('venues').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });

    const inUse = await countEvents(db, id, existing.name);
    if (inUse > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${inUse} event${inUse === 1 ? ' uses' : 's use'} this venue, so it cannot be deleted. Deactivate it instead to hide it from new events.`,
          eventCount: inUse,
        },
        { status: 409 }
      );
    }

    await db.collection('venues').deleteOne({ _id: id });

    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: 'venues',
      entityType: 'venue',
      entityId: String(id),
      entityLabel: existing.name,
      before: existing,
      reason,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete venue' }, { status: 500 });
  }
}
