import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { collectionFor, findParty, parseRole } from '@/app/api/admin/artists/_shared';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

type Decision = 'approve' | 'reject' | 'request_corrections' | 'reopen';

const LEGACY: Record<string, Decision> = { approved: 'approve', rejected: 'reject', pending: 'reopen' };

/**
 * POST /api/kyc/update-status   (admin only, 'kyc:manage')
 *   { role: 'artist' | 'organizer', id (or phone), action, reason }
 *
 * action:
 *   approve              -> kycStatus 'approved'
 *   reject               -> kycStatus 'rejected', reason saved in `rejectionNotes`
 *   request_corrections  -> kycStatus 'rejected' with the note and
 *                           `kycCorrectionRequested: true`. 'rejected' is the
 *                           only state in which the apps let the person
 *                           resubmit documents, so a correction request is
 *                           stored as that state plus the flag.
 *   reopen               -> back to 'pending' (undo an earlier decision)
 *
 * A reason is required for reject, request_corrections, reopen and for any
 * change to a record that already has a decision. Every decision stores
 * `kycReviewedBy` / `kycReviewedAt` and is written to the activity log with
 * the status before and after.
 *
 * The older body { phone, status, role } is still accepted.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'kyc:manage');
  if (!check.ok) return check.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body', 400);
  }

  const role = parseRole(body?.role);
  if (!role) return fail('Role must be artist or organizer', 400);

  const requested = asString(body?.action, 40) || LEGACY[asString(body?.status, 20)] || '';
  if (!['approve', 'reject', 'request_corrections', 'reopen'].includes(requested)) {
    return fail('Unknown action', 400);
  }
  const action = requested as Decision;
  const reason = asString(body?.reason, 1000);

  const id = asString(body?.id, 40);
  const phone = asString(body?.phone, 30);
  if (!id && !phone) return fail('An id or phone number is required', 400);
  if (id && !toObjectId(id)) return fail('Invalid id', 400);

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(collectionFor(role));

    let targetId = id;
    if (!targetId) {
      const found = await collection.findOne({ phone }, { projection: { _id: 1 } });
      if (!found) return fail(`${role === 'artist' ? 'Artist' : 'Organiser'} not found`, 404);
      targetId = String(found._id);
    }

    const existing = await findParty(db, role, targetId);
    if (!existing) return fail(`${role === 'artist' ? 'Artist' : 'Organiser'} not found`, 404);

    const view = existing.kyc;
    const decided = view === 'approved' || view === 'rejected';

    if (action === 'approve') {
      if (view === 'approved') return fail('This KYC is already approved.', 409);
      if (view === 'not_submitted') return fail('No KYC documents have been submitted, so there is nothing to approve.', 400);
    }
    if (action === 'reject' && view === 'rejected' && !existing.kycCorrectionRequested) {
      return fail('This KYC is already rejected.', 409);
    }
    if (action === 'request_corrections' && view === 'rejected' && existing.kycCorrectionRequested) {
      return fail('Corrections have already been requested for this KYC.', 409);
    }
    if (action === 'reopen' && !decided) return fail('This KYC has no decision to reverse.', 409);
    if (view === 'not_submitted' && action !== 'approve') {
      return fail('No KYC documents have been submitted yet.', 400);
    }

    const reversal = decided;
    if (!reason && (action !== 'approve' || reversal)) {
      return fail(
        action === 'approve'
          ? 'A reason is required to reverse an earlier decision.'
          : 'A reason is required for this decision.',
        400
      );
    }

    const now = new Date();
    const reviewer = check.admin.email || check.admin.name || 'admin';
    const set: Record<string, any> = {
      kycReviewedBy: reviewer,
      kycReviewedAt: now,
      updatedAt: now,
    };
    if (action === 'approve') {
      set.kycStatus = 'approved';
      set.rejectionNotes = '';
      set.kycCorrectionRequested = false;
    } else if (action === 'reject') {
      set.kycStatus = 'rejected';
      set.rejectionNotes = reason;
      set.kycCorrectionRequested = false;
    } else if (action === 'request_corrections') {
      set.kycStatus = 'rejected';
      set.rejectionNotes = reason;
      set.kycCorrectionRequested = true;
    } else {
      set.kycStatus = 'pending';
      set.rejectionNotes = '';
      set.kycCorrectionRequested = false;
    }

    await collection.updateOne({ _id: toObjectId(targetId)! }, { $set: set });

    await logAudit({
      admin: check.admin,
      action: 'kyc_' + action,
      module: 'kyc',
      entityType: role,
      entityId: targetId,
      entityLabel: existing.name || existing.phone,
      before: {
        kycStatus: existing.kycStatus,
        kycCorrectionRequested: existing.kycCorrectionRequested,
        rejectionNotes: existing.rejectionNotes,
      },
      after: {
        kycStatus: set.kycStatus,
        kycCorrectionRequested: set.kycCorrectionRequested,
        rejectionNotes: set.rejectionNotes,
      },
      reason,
      meta: { reversal, previousView: view },
      request,
    });

    return ok({
      message: `KYC status updated to ${set.kycStatus}`,
      record: await findParty(db, role, targetId),
    });
  } catch (error) {
    console.error('Error updating KYC status:', error);
    return fail('Failed to update KYC status', 500);
  }
}
