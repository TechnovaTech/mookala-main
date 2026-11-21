import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { diff, logAudit } from '@/lib/audit';
import { asString, toObjectId } from '@/lib/http';
import { mediaProblem, readDate, readPositiveInt } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'ads:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid ad id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const reason = asString(body?.reason, 500);
    if (reason.length < 5) {
      return NextResponse.json({ success: false, error: 'Write a reason of at least 5 characters. It is saved in the activity log.' }, { status: 400 });
    }
    const { db } = await connectToDatabase();
    const existing = await db.collection('ads').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Ad not found' }, { status: 404 });

    await db.collection('ads').deleteOne({ _id: id });

    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: 'ads',
      entityType: 'ad',
      entityId: String(id),
      entityLabel: existing.title,
      before: existing,
      reason,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete ad' }, { status: 500 });
  }
}

/** PUT /api/ads/[id]: changes only the fields that were sent, including `status`. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'ads:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid ad id' }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    // Requirements section 16: an edit, activation or deactivation is logged with its reason.
    const reason = asString(body?.reason, 500);
    if (reason.length < 5) {
      return NextResponse.json({ success: false, error: 'Write a reason of at least 5 characters. It is saved in the activity log.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const existing = await db.collection('ads').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Ad not found' }, { status: 404 });

    const set: Record<string, any> = {};

    for (const key of ['title', 'sponsor'] as const) {
      if (!(key in body)) continue;
      set[key] = asString(body[key], 200);
      if (!set[key]) return NextResponse.json({ success: false, error: `Ad ${key} cannot be empty` }, { status: 400 });
    }
    if ('image' in body && body.image !== existing.image) {
      if (!body.image) return NextResponse.json({ success: false, error: 'An ad needs an image or a video' }, { status: 400 });
      const problem = mediaProblem(body.image, 'Ad file', { allowVideo: true });
      if (problem) return problem;
      set.image = body.image;
      set.mediaType = String(body.image).startsWith('data:video/') || body.mediaType === 'video' ? 'video' : 'image';
    }
    if ('link' in body) {
      set.link = asString(body.link, 2000);
      if (set.link && !/^https?:\/\//i.test(set.link)) {
        return NextResponse.json({ success: false, error: 'Link must start with http:// or https://' }, { status: 400 });
      }
    }
    for (const key of ['startDate', 'endDate'] as const) {
      if (!(key in body)) continue;
      const value = readDate(body[key]);
      if (!value) return NextResponse.json({ success: false, error: 'Start and end date must be valid dates' }, { status: 400 });
      set[key] = value;
    }
    if ('duration' in body) set.duration = readPositiveInt(body.duration, 0, 3600);
    if ('order' in body) set.order = Math.max(1, readPositiveInt(body.order, 1));
    if ('status' in body) {
      if (body.status !== 'active' && body.status !== 'inactive') {
        return NextResponse.json({ success: false, error: 'status must be active or inactive' }, { status: 400 });
      }
      set.status = body.status;
    }

    const merged = { ...existing, ...set };
    if (merged.startDate && merged.endDate && new Date(merged.endDate) < new Date(merged.startDate)) {
      return NextResponse.json({ success: false, error: 'End date cannot be before the start date' }, { status: 400 });
    }

    const changes = diff(existing, merged);
    if (Object.keys(changes.after).length === 0) return NextResponse.json({ success: true, unchanged: true });

    await db.collection('ads').updateOne({ _id: id }, { $set: { ...set, updatedAt: new Date(), updatedBy: check.admin.email || null } });

    await logAudit({
      admin: check.admin,
      action: 'status' in changes.after && Object.keys(changes.after).length === 1 ? 'status_change' : 'update',
      module: 'ads',
      entityType: 'ad',
      entityId: String(id),
      entityLabel: merged.title,
      before: changes.before,
      after: changes.after,
      reason,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update ad' }, { status: 500 });
  }
}
