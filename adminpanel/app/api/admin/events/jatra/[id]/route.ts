import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'rejected'];

/** PATCH /api/admin/events/jatra/[id]  { status, reason }: approve or reject a Jatra registration. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'events:manage');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return fail('Invalid registration id', 400);

    const body = await request.json().catch(() => null);
    const status = asString(body?.status, 20);
    const reason = asString(body?.reason, 500);
    if (!STATUSES.includes(status)) return fail('status must be pending, approved or rejected', 400);

    const { db } = await connectToDatabase();
    const jatra = await db.collection('jatras').findOne({ _id: id });
    if (!jatra) return fail('Jatra registration not found', 404);

    const previous = jatra.status || 'pending';
    if (previous === status) return ok({ unchanged: true });
    if (status === 'rejected' && !reason) return fail('A reason is required to reject a registration', 400);
    if (previous !== 'pending' && !reason) return fail('A reason is required to reverse a decision', 400);

    const now = new Date();
    await db.collection('jatras').updateOne(
      { _id: id },
      {
        $set: {
          status,
          rejectionReason: status === 'rejected' ? reason : null,
          statusReason: reason || null,
          reviewedBy: check.admin.email || null,
          reviewedAt: now,
          updatedAt: now,
        },
      }
    );

    await logAudit({
      admin: check.admin,
      action: 'status_change',
      module: 'events',
      entityType: 'jatra',
      entityId: String(id),
      entityLabel: jatra.name,
      before: { status: previous },
      after: { status },
      reason: reason || null,
      request,
    });

    return ok({ status });
  } catch (error) {
    console.error('Jatra decision failed:', error);
    return fail('Failed to update the registration', 500);
  }
}
