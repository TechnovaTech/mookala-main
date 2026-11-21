import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, ok, toObjectId } from '@/lib/http';
import { deletionImpact } from '@/lib/resources/legal.hooks';

export const dynamic = 'force-dynamic';

/**
 * Records what was done about an approved deletion request, with a snapshot
 * of the record counts at that moment, and optionally marks it completed.
 *
 * Nothing is deleted here. The outcome is the admin's statement of what they
 * removed, anonymised or kept by hand.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'legal:manage');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid request id');

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const outcome = typeof body.outcome === 'string' ? body.outcome.trim().slice(0, 4000) : '';
    if (outcome.length < 10) return fail('Describe what was done with the records (at least 10 characters)');
    const markCompleted = body.markCompleted === true;

    const { db } = await connectToDatabase();
    const requests = db.collection('deletionRequests');
    const item = await requests.findOne({ _id: oid });
    if (!item) return fail('Deletion request not found', 404);

    if (item.status !== 'approved') {
      return fail('An outcome can only be recorded for an approved request.', 409);
    }
    if (item.legalHold === true) {
      return fail('This request is under legal hold, so the data must be kept. Remove the legal hold first.', 409);
    }

    const impact = await deletionImpact(db, item.requesterPhone);
    const now = new Date();
    const set: Record<string, any> = {
      outcome,
      outcomeRecordedAt: now,
      outcomeRecordedBy: check.admin.email || null,
      // What still matched when the outcome was recorded, as evidence.
      outcomeRecordCounts: impact.rows.map((r) => ({ collection: r.collection, count: r.count, treatment: r.treatment })),
      updatedAt: now,
      updatedBy: check.admin.email || null,
    };
    if (markCompleted) {
      set.status = 'completed';
      set.statusReason = 'Outcome recorded';
      set.statusChangedAt = now;
      set.statusChangedBy = check.admin.email || null;
      set.completedAt = now;
    }
    await requests.updateOne({ _id: oid }, { $set: set });

    await logAudit({
      admin: check.admin,
      action: markCompleted ? 'complete' : 'record_outcome',
      module: 'legal',
      entityType: 'deletion-requests',
      entityId: String(item._id),
      entityLabel: item.requesterName,
      before: { status: item.status, outcome: item.outcome || null },
      after: { status: markCompleted ? 'completed' : item.status, outcome, recordCounts: set.outcomeRecordCounts },
      request,
    });

    return ok({ status: markCompleted ? 'completed' : item.status, outcome, recordCounts: set.outcomeRecordCounts });
  } catch (error) {
    console.error('Record deletion outcome failed:', error);
    return fail('Failed to record the outcome', 500);
  }
}
