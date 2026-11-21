import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'accepted', 'rejected', 'completed'];

/** PUT /api/hire-requests/[id]  { status, reason }: moves a request to pending, accepted, rejected or completed. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'hire:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid hire request id' }, { status: 400 });

    const body = await request.json().catch(() => null);
    const status = asString(body?.status, 20);
    const reason = asString(body?.reason, 500);

    if (!status) return NextResponse.json({ success: false, error: 'status is required' }, { status: 400 });
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: 'status must be pending, accepted, rejected or completed' }, { status: 400 });
    }
    if (status === 'rejected' && !reason) {
      return NextResponse.json({ success: false, error: 'A reason is required to reject a hire request' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const existing = await db.collection('hireRequests').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Hire request not found' }, { status: 404 });

    const previous = existing.status || 'pending';
    if (previous === status) return NextResponse.json({ success: true, unchanged: true });

    await db.collection('hireRequests').updateOne(
      { _id: id },
      { $set: { status, statusReason: reason || null, updatedAt: new Date(), updatedBy: check.admin.email || null } }
    );

    await logAudit({
      admin: check.admin,
      action: 'status_change',
      module: 'hire',
      entityType: 'hire_request',
      entityId: String(id),
      entityLabel: `${existing.userName || existing.userPhone || 'Customer'} → ${existing.professionalName || 'professional'}`,
      before: { status: previous },
      after: { status },
      reason: reason || null,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update hire request' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'hire:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return NextResponse.json({ success: false, error: 'Invalid hire request id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const { db } = await connectToDatabase();
    const existing = await db.collection('hireRequests').findOne({ _id: id });
    if (!existing) return NextResponse.json({ success: false, error: 'Hire request not found' }, { status: 404 });

    await db.collection('hireRequests').deleteOne({ _id: id });

    await logAudit({
      admin: check.admin,
      action: 'delete',
      module: 'hire',
      entityType: 'hire_request',
      entityId: String(id),
      entityLabel: `${existing.userName || existing.userPhone || 'Customer'} → ${existing.professionalName || 'professional'}`,
      before: existing,
      reason: asString(body?.reason, 500) || null,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete hire request' }, { status: 500 });
  }
}
