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
    if (!id) return NextResponse.json({ success: false, error: 'Invalid banner id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const reason = asString(body?.reason, 500);
    if (reason.length < 5) {
      return NextResponse.json({ success: false, error: 'Write a reason of at least 5 characters. It is saved in the activity log.' }, { status: 400 });
    }
    const { db } = await connectToDatabase();
    const existing = await db.collection('banners').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Banner not found' }, { status: 404 });

    await db.collection('banners').deleteOne({ _id: id });

    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: 'ads',
      entityType: 'banner',
      entityId: String(id),
      entityLabel: existing.title,
      before: existing,
      reason,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete banner' }, { status: 500 });
  }
}

/** PUT /api/banners/[id]: changes only the fields that were sent, including `status`. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'ads:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid banner id' }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    // Requirements section 16: an edit, activation or deactivation is logged with its reason.
    const reason = asString(body.reason, 500);
    if (reason.length < 5) {
      return NextResponse.json({ success: false, error: 'Write a reason of at least 5 characters. It is saved in the activity log.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const existing = await db.collection('banners').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Banner not found' }, { status: 404 });

    const set: Record<string, any> = {};

    if ('title' in body) {
      set.title = asString(body.title, 200);
      if (!set.title) return NextResponse.json({ success: false, error: 'Banner title cannot be empty' }, { status: 400 });
    }
    if ('image' in body && body.image !== existing.image) {
      if (!body.image) return NextResponse.json({ success: false, error: 'A banner needs an image or a video' }, { status: 400 });
      const problem = mediaProblem(body.image, 'Banner file', { allowVideo: true });
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
    if ('order' in body) set.order = Math.max(1, readPositiveInt(body.order, 1));
    if ('status' in body) {
      if (body.status !== 'active' && body.status !== 'inactive') {
        return NextResponse.json({ success: false, error: 'status must be active or inactive' }, { status: 400 });
      }
      set.status = body.status;
    }
    for (const key of ['startDate', 'endDate'] as const) {
      if (!(key in body)) continue;
      const value = readDate(body[key]);
      if (value === undefined) return NextResponse.json({ success: false, error: 'Start or end date is not a valid date' }, { status: 400 });
      set[key] = value;
    }

    const merged = { ...existing, ...set };
    if (merged.startDate && merged.endDate && new Date(merged.endDate) < new Date(merged.startDate)) {
      return NextResponse.json({ success: false, error: 'End date cannot be before the start date' }, { status: 400 });
    }

    const changes = diff(existing, merged);
    if (Object.keys(changes.after).length === 0) return NextResponse.json({ success: true, unchanged: true });

    await db
      .collection('banners')
      .updateOne({ _id: id }, { $set: { ...set, updatedAt: new Date(), updatedBy: check.admin.email || null } });

    await logAudit({
      admin: check.admin,
      action: 'status' in changes.after && Object.keys(changes.after).length === 1 ? 'status_change' : 'update',
      module: 'ads',
      entityType: 'banner',
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
    return NextResponse.json({ success: false, error: 'Failed to update banner' }, { status: 500 });
  }
}
