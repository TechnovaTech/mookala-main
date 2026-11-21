import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { diff, logAudit } from '@/lib/audit';
import { asString, toObjectId } from '@/lib/http';
import { mediaProblem } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

const TYPES = ['photographer', 'videographer'];
const TEXT_LIMITS: Record<string, number> = { phone: 30, city: 100, price: 100, bio: 5000, experience: 100 };

/** PUT /api/professionals/[id]: changes only the fields that were sent, including `status`. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'hire:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid professional id' }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });

    const { db } = await connectToDatabase();
    const existing = await db.collection('professionals').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Professional not found' }, { status: 404 });

    const set: Record<string, any> = {};

    if ('name' in body) {
      set.name = asString(body.name, 200);
      if (!set.name) return NextResponse.json({ success: false, error: 'Name cannot be empty' }, { status: 400 });
    }
    if ('type' in body) {
      if (!TYPES.includes(body.type)) {
        return NextResponse.json({ success: false, error: 'type must be photographer or videographer' }, { status: 400 });
      }
      set.type = body.type;
    }
    for (const key of Object.keys(TEXT_LIMITS)) {
      if (key in body) set[key] = asString(body[key], TEXT_LIMITS[key]);
    }
    if ('portfolio' in body) {
      set.portfolio = asString(body.portfolio, 2000);
      if (set.portfolio && !/^https?:\/\//i.test(set.portfolio)) {
        return NextResponse.json({ success: false, error: 'Portfolio link must start with http:// or https://' }, { status: 400 });
      }
    }
    if ('image' in body && body.image !== existing.image) {
      const problem = mediaProblem(body.image, 'Photo');
      if (problem) return problem;
      set.image = typeof body.image === 'string' ? body.image : '';
    }
    if ('status' in body) {
      if (body.status !== 'active' && body.status !== 'inactive') {
        return NextResponse.json({ success: false, error: 'status must be active or inactive' }, { status: 400 });
      }
      set.status = body.status;
    }

    const merged = { ...existing, ...set };
    const changes = diff(existing, merged);
    if (Object.keys(changes.after).length === 0) return NextResponse.json({ success: true, unchanged: true });

    await db
      .collection('professionals')
      .updateOne({ _id: id }, { $set: { ...set, updatedAt: new Date(), updatedBy: check.admin.email || null } });

    await logAudit({
      admin: check.admin,
      action: 'status' in changes.after && Object.keys(changes.after).length === 1 ? 'status_change' : 'update',
      module: 'hire',
      entityType: 'professional',
      entityId: String(id),
      entityLabel: merged.name,
      before: changes.before,
      after: changes.after,
      reason: asString(body.reason, 500) || null,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update professional' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'hire:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid professional id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const { db } = await connectToDatabase();
    const existing = await db.collection('professionals').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Professional not found' }, { status: 404 });

    const openRequests = await db
      .collection('hireRequests')
      .countDocuments({ professionalId: String(id), status: { $in: ['pending', 'accepted'] } });

    await db.collection('professionals').deleteOne({ _id: id });

    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: 'hire',
      entityType: 'professional',
      entityId: String(id),
      entityLabel: existing.name,
      before: existing,
      reason: asString(body?.reason, 500) || null,
      meta: { openHireRequests: openRequests },
      request,
    });

    return NextResponse.json({ success: true, openHireRequests: openRequests });
  } catch (error) {
    console.error('DELETE Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete professional' }, { status: 500 });
  }
}
