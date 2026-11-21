import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { ok, fail, asString, toObjectId } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import {
  APPROVALS,
  SENSITIVE_ACTIONS,
  approvalReference,
  expireOldApprovals,
  isSameAdmin,
  mayDecide,
  publicApproval,
  replayOf,
  type ApprovalStatus,
} from '@/lib/approvals';
import type { AdminIdentity } from '@/lib/permissions';
import { isSuperAdmin, readBody } from '../_shared';
import { performReplay } from './replay';

export const dynamic = 'force-dynamic';

const STATUSES: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'executed', 'expired'];

/** Which approval requests this admin may see: their own, ones they decided, and ones they may decide. */
function visibleFilter(admin: AdminIdentity): Record<string, any> {
  if (isSuperAdmin(admin)) return {};
  const decidable = SENSITIVE_ACTIONS.filter((action) => mayDecide(admin, action)).map((action) => action.key);
  const own = admin.id || '__none__';
  return { $or: [{ requestedById: own }, { decidedById: own }, ...(decidable.length ? [{ action: { $in: decidable } }] : [])] };
}

/**
 * Changes held for a second approver (see lib/approvals.ts).
 *
 *   GET ?status=pending|approved|rejected|executed|expired|open&action=<key>[,<key>]&page=
 *   GET ?id=<request id>
 *   POST { action: 'approve' | 'reject', id, reason }
 *   POST { action: 'execute', id }     carries out an approved change ("Carry out now")
 *
 * Any signed-in admin may call this route; what they see and may do follows
 * from who asked and from mayDecide (a different Super Admin for admin and
 * security changes, otherwise a different admin holding the action's
 * permission). The requester can never approve their own request.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  const { admin } = check;

  const { db } = await connectToDatabase();
  await expireOldApprovals(db);
  const requests = db.collection(APPROVALS);
  const params = request.nextUrl.searchParams;
  const visible = visibleFilter(admin);

  if (params.has('id')) {
    const id = toObjectId(params.get('id'));
    if (!id) return fail('That approval id is not valid.');
    const doc = await requests.findOne({ $and: [{ _id: id }, visible] });
    if (!doc) return fail('Approval request not found.', 404);
    return ok({ approval: publicApproval(doc, admin) });
  }

  // `open` is pending and approved together: what a screen shows as "waiting".
  const status = asString(params.get('status'), 20) || 'pending';
  if (status !== 'open' && !STATUSES.includes(status as ApprovalStatus)) return fail('Unknown status.');
  const filter: Record<string, any> = { $and: [visible, status === 'open' ? { status: { $in: ['pending', 'approved'] } } : { status }] };
  const actions = asString(params.get('action'), 200).split(',').map((value) => value.trim()).filter(Boolean);
  if (actions.length) filter.$and.push({ action: { $in: actions } });

  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = 25;
  const [rows, total, grouped] = await Promise.all([
    requests
      .find(filter, { projection: { replayBody: 0 } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    requests.countDocuments(filter),
    requests.aggregate([{ $match: visible }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
  ]);

  const items = rows.map((doc) => publicApproval(doc, admin));
  return ok({
    approvals: items,
    total,
    page,
    limit,
    counts: Object.fromEntries(STATUSES.map((value) => [value, grouped.find((row) => row._id === value)?.count || 0])),
    actions: SENSITIVE_ACTIONS.map((item) => ({ key: item.key, label: item.label })),
  });
}

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  const { admin } = check;

  const body = await readBody(request);
  const verb = asString(body.action, 20);
  if (!['approve', 'reject', 'execute'].includes(verb)) return fail('Unknown action.');
  const id = toObjectId(body.id);
  if (!id) return fail('That approval id is not valid.');

  const { db } = await connectToDatabase();
  await expireOldApprovals(db);
  const requests = db.collection(APPROVALS);
  const doc = await requests.findOne({ $and: [{ _id: id }, visibleFilter(admin)] });
  if (!doc) return fail('Approval request not found.', 404);

  const ref = approvalReference(doc._id);
  const action = SENSITIVE_ACTIONS.find((item) => item.key === doc.action);
  const label = `${action?.label || doc.actionLabel || doc.action}: ${doc.entityLabel || doc.entityType}`;

  /* ------------------------- approve / reject -------------------------- */
  if (verb === 'approve' || verb === 'reject') {
    const reason = asString(body.reason, 500);
    if (reason.length < 5) return fail('Write a reason of at least 5 characters. It is saved with the decision and in the activity log.');
    if (doc.status !== 'pending') return fail(`${ref} is ${doc.status}, so it can no longer be ${verb === 'approve' ? 'approved' : 'rejected'}.`, 409);
    if (isSameAdmin(doc, 'requested', admin)) {
      return fail(`You asked for this change, so you cannot ${verb} it yourself. ${publicApproval(doc, admin).needs} must decide.`, 403);
    }
    if (!mayDecide(admin, action)) {
      return fail(
        action?.superOnly
          ? `Only a Super Admin other than the requester can decide on "${action.label}".`
          : `Deciding on "${action?.label || doc.action}" needs the ${doc.permission} permission.`,
        403
      );
    }

    const status: ApprovalStatus = verb === 'approve' ? 'approved' : 'rejected';
    const now = new Date();
    // One atomic step, so two admins deciding at the same moment cannot both win.
    const result = await requests.updateOne(
      { _id: doc._id, status: 'pending', expiresAt: { $gt: now } },
      { $set: { status, decidedBy: admin.email || null, decidedById: admin.id || null, decidedByName: admin.name || null, decidedAt: now, decisionReason: reason } }
    );
    if (result.modifiedCount !== 1) return fail(`${ref} was decided by someone else or has just expired. Reload the list.`, 409);

    await logAudit({
      admin,
      action: verb === 'approve' ? 'approval_approved' : 'approval_rejected',
      module: 'security',
      entityType: 'approval-request',
      entityId: String(doc._id),
      entityLabel: label,
      before: { status: 'pending' },
      after: { status },
      reason,
      meta: { action: doc.action, requestedBy: doc.requestedBy, targetType: doc.entityType, targetId: doc.entityId },
      request,
    });

    const fresh = await requests.findOne({ _id: doc._id });
    return ok({
      approval: publicApproval(fresh, admin),
      message:
        verb === 'approve'
          ? `${ref} approved. Nothing has changed yet: ${doc.requestedBy || 'the requester'} or you can now carry it out.`
          : `${ref} rejected. Nothing was changed.`,
    });
  }

  /* ------------------------------ execute ------------------------------ */
  const view = publicApproval(doc, admin);
  if (doc.status !== 'approved') return fail(`${ref} is ${doc.status}. Only an approved request can be carried out.`, 409);
  if (!view.canExecute) return fail(`${ref} can only be carried out by the admin who asked for it or the admin who approved it.`, 403);
  const replay = replayOf(doc);
  if (!replay) return fail(`The stored change for ${ref} cannot be read, so it cannot be carried out here. Save the same change again from its own screen.`, 500);

  let outcome: { status: number; data: any };
  try {
    outcome = await performReplay(request, replay, String(doc._id));
  } catch (error) {
    console.error('Carrying out an approved change failed:', error);
    outcome = { status: 500, data: { success: false, error: 'The change could not be carried out.' } };
  }

  const succeeded = outcome.status >= 200 && outcome.status < 300 && outcome.data?.success !== false;
  if (!succeeded) {
    await logAudit({
      admin,
      action: 'approval_carry_out_failed',
      module: 'security',
      entityType: 'approval-request',
      entityId: String(doc._id),
      entityLabel: label,
      before: { status: 'approved' },
      after: { status: 'approved', httpStatus: outcome.status, error: outcome.data?.error || null },
      reason: doc.reason,
      meta: { action: doc.action, path: replay.path, method: replay.method },
      request,
    });
    const fresh = await requests.findOne({ _id: doc._id });
    return fail(`${ref} was not carried out: ${outcome.data?.error || `the change was refused (${outcome.status}).`}`, outcome.status >= 400 ? outcome.status : 409, {
      approval: fresh ? publicApproval(fresh, admin) : null,
    });
  }

  const fresh = await requests.findOne({ _id: doc._id });
  return ok({
    approval: fresh ? publicApproval(fresh, admin) : null,
    // e.g. the one-time temporary password of a newly created admin.
    result: outcome.data,
    message: `${ref} carried out. The change is saved and recorded in the activity log.`,
  });
}
