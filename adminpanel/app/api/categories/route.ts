import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { diff, logAudit } from '@/lib/audit';
import { asString, escapeRegex, toObjectId } from '@/lib/http';
import { mediaProblem } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

/** GET /api/categories: read by the website and both apps. Returns a plain array. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const categories = await db.collection('categories').find({}).toArray();
    return NextResponse.json(categories);
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

/** Validates the editable fields. `partial` keeps fields that were not sent untouched. */
function readCategory(body: any, partial: boolean): { data?: Record<string, any>; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request body' };
  const data: Record<string, any> = {};

  if (!partial || 'name' in body) {
    data.name = asString(body.name, 120);
    if (!data.name) return { error: 'Category name is required' };
  }
  if (!partial || 'type' in body) {
    data.type = asString(body.type, 60);
    if (!data.type) return { error: 'Category type is required' };
  }
  if (!partial || 'image' in body) {
    data.image = typeof body.image === 'string' && body.image ? body.image : null;
  }
  if (!partial || 'subCategories' in body) {
    const list = Array.isArray(body.subCategories) ? body.subCategories : [];
    const seen = new Set<string>();
    data.subCategories = [];
    for (const entry of list.slice(0, 100)) {
      const name = asString(typeof entry === 'string' ? entry : entry?.name, 120);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      data.subCategories.push({ name });
    }
  }
  return { data };
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'categories:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    const { data, error } = readCategory(body, false);
    if (error || !data) return NextResponse.json({ success: false, error }, { status: 400 });

    const tooBig = mediaProblem(data.image, 'Category image');
    if (tooBig) return tooBig;

    const { db } = await connectToDatabase();
    const duplicate = await db
      .collection('categories')
      .findOne({ name: { $regex: `^${escapeRegex(data.name)}$`, $options: 'i' } }, { projection: { _id: 1 } });
    if (duplicate) return NextResponse.json({ success: false, error: `A category named "${data.name}" already exists` }, { status: 409 });

    // This list is returned to the public as stored, so no admin details are kept on it.
    const doc = { ...data, createdAt: new Date() };
    const result = await db.collection('categories').insertOne(doc);

    await logAudit({
      admin: check.admin,
      action: 'create',
      module: 'categories',
      entityType: 'category',
      entityId: String(result.insertedId),
      entityLabel: data.name,
      after: doc,
      request,
    });

    return NextResponse.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create category' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request, 'categories:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ success: false, error: 'A valid category id is required' }, { status: 400 });

    const body = await request.json().catch(() => null);
    const { data, error } = readCategory(body, true);
    if (error || !data) return NextResponse.json({ success: false, error }, { status: 400 });
    if (Object.keys(data).length === 0) return NextResponse.json({ success: false, error: 'Nothing to change' }, { status: 400 });

    const tooBig = mediaProblem(data.image, 'Category image');
    if (tooBig) return tooBig;

    const { db } = await connectToDatabase();
    const existing = await db.collection('categories').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });

    if (data.name) {
      const duplicate = await db
        .collection('categories')
        .findOne({ _id: { $ne: id }, name: { $regex: `^${escapeRegex(data.name)}$`, $options: 'i' } }, { projection: { _id: 1 } });
      if (duplicate) return NextResponse.json({ success: false, error: `A category named "${data.name}" already exists` }, { status: 409 });
    }

    await db
      .collection('categories')
      .updateOne({ _id: id }, { $set: { ...data, updatedAt: new Date() } });

    const changes = diff(existing, { ...existing, ...data });
    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'categories',
      entityType: 'category',
      entityId: String(id),
      entityLabel: data.name || existing.name,
      before: changes.before,
      after: changes.after,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update category' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const check = await requireAdmin(request, 'categories:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ success: false, error: 'A valid category id is required' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const reason = asString(body?.reason, 500);

    const { db } = await connectToDatabase();
    const existing = await db.collection('categories').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });

    const inUse = await db.collection('events').countDocuments({ category: existing.name });
    await db.collection('categories').deleteOne({ _id: id });

    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: 'categories',
      entityType: 'category',
      entityId: String(id),
      entityLabel: existing.name,
      before: existing,
      reason: reason || null,
      meta: { eventsUsingCategory: inUse },
      request,
    });

    return NextResponse.json({ success: true, eventsUsingCategory: inUse });
  } catch (error) {
    console.error('DELETE Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete category' }, { status: 500 });
  }
}
