import crypto from 'crypto';
import { NextResponse } from 'next/server';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { can, normaliseRole, type AdminIdentity } from './permissions';
import { logAudit, sanitiseForAudit } from './audit';
import { decryptValue, encryptValue } from './crypto';
import { SENSITIVE_ACTIONS, getSecuritySettings, sensitiveAction, type SecuritySettings, type SensitiveAction } from './security-settings';

/**
 * Second-approver control for sensitive actions. Server only.
 *
 * Which actions need a second approver is a security setting (see
 * SENSITIVE_ACTIONS in lib/security-settings.ts). When an action needs one,
 * its handler calls `gateSensitiveAction` immediately before writing:
 *
 *   1. No approval yet: nothing is changed. A request is stored in
 *      `approvalRequests` (status "pending", expires after 48 hours) and the
 *      handler answers 202.
 *   2. A DIFFERENT admin who may perform that action approves or rejects it
 *      with a reason (for admin and security changes: a different Super Admin).
 *   3. The requester or the approver submits the same change again. The gate
 *      finds the approved request (by its id, or by the same action, record
 *      and payload hash), checks it is unexpired and unused, marks it
 *      "executed" in one atomic step and lets the handler write.
 *
 * The same person can never both request and approve. Every step is written
 * to the activity log. With fewer than two active Super Admins, actions that
 * need a second Super Admin go ahead without approval: otherwise the only
 * Super Admin could never change anything.
 */

export const APPROVALS = 'approvalRequests';
export const APPROVAL_HOURS = 48;

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';

export const SUPER_ROLE_VALUES = ['super_admin', 'admin'];

export async function activeSuperAdminCount(db: Db): Promise<number> {
  return db.collection('admins').countDocuments({ role: { $in: SUPER_ROLE_VALUES }, status: { $ne: 'disabled' } });
}

/** JSON with object keys in a fixed order and dates as ISO text, so equal payloads hash equally. */
function stable(value: any): any {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as any).toHexString === 'function') return String(value);
  if (Array.isArray(value)) return value.map(stable);
  const out: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
  return out;
}

export function payloadHash(payload: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
}

/**
 * Whether the action needs a second approver right now. An action only a
 * Super Admin can approve is never held while fewer than two Super Admins are
 * active.
 */
export async function approvalNeeded(db: Db, key: string, settings?: SecuritySettings): Promise<boolean> {
  const action = sensitiveAction(key);
  if (!action) return false;
  const current = settings || (await getSecuritySettings(db));
  if (!current.approvalActions[key]) return false;
  if (action.superOnly && (await activeSuperAdminCount(db)) < 2) return false;
  return true;
}

/** Whether this admin may approve or reject requests for the action (leaving aside who asked). */
export function mayDecide(admin: AdminIdentity | null | undefined, action: SensitiveAction | undefined): boolean {
  if (!admin || !action) return false;
  if (action.superOnly) return normaliseRole(admin.role) === 'super_admin';
  return can(admin, action.permission);
}

/** Marks requests whose 48 hours have passed. Called before requests are read or used. */
export async function expireOldApprovals(db: Db): Promise<void> {
  await db
    .collection(APPROVALS)
    .updateMany({ status: { $in: ['pending', 'approved'] }, expiresAt: { $lte: new Date() } }, { $set: { status: 'expired', expiredAt: new Date() } });
}

export interface ReplayRequest {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path of the admin API that performs the action, e.g. /api/admin/platform. */
  path: string;
  body: Record<string, any>;
}

export interface GateInput {
  /** Key of the sensitive action, from SENSITIVE_ACTIONS. */
  action: string;
  admin: AdminIdentity;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  /** Old and new values shown to the approver. Secrets are masked before they are stored. */
  before?: any;
  after?: any;
  /** The exact change. Its hash ties the approval to this change and no other. */
  payload: any;
  reason: string;
  /** Approval id sent with a re-submission, when the caller has one. */
  approvalId?: string | null;
  /** The request that performs the action, kept encrypted so the Approvals screen can carry it out. */
  replay: ReplayRequest;
  ip?: string | null;
  userAgent?: string | null;
}

export type GateResult =
  | { proceed: true; approval: any | null }
  | { proceed: false; status: number; message: string; approvalId: string | null; code: 'approval_pending' | 'approval_invalid' | 'reason_required' };

export function approvalReference(id: unknown): string {
  return 'APR-' + String(id).slice(-6).toUpperCase();
}

function sameAdmin(doc: any, field: 'requested' | 'decided', admin: AdminIdentity): boolean {
  const id = doc?.[`${field}ById`];
  const email = doc?.[`${field}By`];
  return Boolean((id && admin.id && String(id) === String(admin.id)) || (email && admin.email && String(email).toLowerCase() === String(admin.email).toLowerCase()));
}

export async function gateSensitiveAction(db: Db, input: GateInput): Promise<GateResult> {
  const action = sensitiveAction(input.action);
  if (!action || !(await approvalNeeded(db, input.action))) return { proceed: true, approval: null };

  const requests = db.collection(APPROVALS);
  const hash = payloadHash(input.payload);
  const entityId = input.entityId ? String(input.entityId) : null;
  const now = new Date();
  await expireOldApprovals(db);

  const invalid = (message: string, approvalId: string | null = null): GateResult => ({
    proceed: false,
    status: 409,
    message,
    approvalId,
    code: 'approval_invalid',
  });

  /* ---- 1. An approval that covers exactly this change ---- */
  let approval: any = null;
  if (input.approvalId) {
    if (!ObjectId.isValid(input.approvalId) || String(input.approvalId).length !== 24) return invalid('That approval id is not valid.');
    approval = await requests.findOne({ _id: new ObjectId(input.approvalId) });
    if (!approval) return invalid('That approval request does not exist.');
    const ref = approvalReference(approval._id);
    if (approval.status === 'pending') return invalid(`Approval ${ref} has not been decided yet. Nothing was changed.`, String(approval._id));
    if (approval.status === 'rejected') return invalid(`Approval ${ref} was rejected. Nothing was changed.`, String(approval._id));
    if (approval.status === 'executed') return invalid(`Approval ${ref} has already been used. Nothing was changed.`, String(approval._id));
    if (approval.status !== 'approved') return invalid(`Approval ${ref} has expired. Send the change for approval again.`, String(approval._id));
    if (approval.action !== input.action || approval.entityType !== input.entityType || (approval.entityId || null) !== entityId) {
      return invalid(`Approval ${ref} is for a different action or record. Nothing was changed.`, String(approval._id));
    }
    if (approval.payloadHash !== hash) {
      return invalid(`Approval ${ref} was given for different values. Nothing was changed: submit exactly the change that was approved.`, String(approval._id));
    }
    if (!sameAdmin(approval, 'requested', input.admin) && !sameAdmin(approval, 'decided', input.admin)) {
      return invalid(`Approval ${ref} can only be carried out by the admin who asked for it or the admin who approved it.`, String(approval._id));
    }
  } else {
    approval = await requests.findOne({
      action: input.action,
      entityType: input.entityType,
      entityId,
      payloadHash: hash,
      status: 'approved',
      expiresAt: { $gt: now },
      $or: [{ requestedById: input.admin.id || '__none__' }, { decidedById: input.admin.id || '__none__' }],
    });
  }

  if (approval) {
    // One atomic step: an approval can be used once, even if two requests arrive together.
    const used = await requests.findOneAndUpdate(
      { _id: approval._id, status: 'approved', expiresAt: { $gt: now } },
      { $set: { status: 'executed', executedAt: now, executedBy: input.admin.email || null, executedById: input.admin.id || null } },
      { returnDocument: 'after' }
    );
    const consumed: any = used && (used as any).value !== undefined ? (used as any).value : used;
    if (!consumed) return invalid(`Approval ${approvalReference(approval._id)} has already been used or has expired. Nothing was changed.`, String(approval._id));

    await logAudit({
      admin: input.admin,
      action: 'approval_executed',
      module: 'security',
      entityType: 'approval-request',
      entityId: String(approval._id),
      entityLabel: `${action.label}: ${approval.entityLabel || approval.entityType}`,
      before: { status: 'approved' },
      after: { status: 'executed' },
      reason: approval.reason,
      meta: { action: input.action, requestedBy: approval.requestedBy, approvedBy: approval.decidedBy },
    });
    return { proceed: true, approval: consumed };
  }

  /* ---- 2. The same admin already asked for exactly this ---- */
  const waiting = await requests.findOne({
    action: input.action,
    entityType: input.entityType,
    entityId,
    payloadHash: hash,
    status: 'pending',
    requestedById: input.admin.id || '__none__',
  });
  const who = action.superOnly ? 'a different Super Admin' : `a different admin who holds ${action.permission}`;
  if (waiting) {
    return {
      proceed: false,
      status: 202,
      message: `Not changed yet. This change is already waiting for approval (${approvalReference(waiting._id)}). It needs ${who} to approve it under Security & Audit, Approvals.`,
      approvalId: String(waiting._id),
      code: 'approval_pending',
    };
  }

  /* ---- 3. A new request ---- */
  const reason = String(input.reason || '').trim().slice(0, 500);
  if (!reason) {
    return {
      proceed: false,
      status: 400,
      message: `${action.label}: this change needs a second approver, so a written reason is required. Nothing was changed.`,
      approvalId: null,
      code: 'reason_required',
    };
  }

  const doc = {
    action: input.action,
    actionLabel: action.label,
    module: action.module,
    superOnly: action.superOnly,
    permission: action.permission,
    entityType: input.entityType,
    entityId,
    entityLabel: input.entityLabel || null,
    summary: { before: sanitiseForAudit(input.before ?? null), after: sanitiseForAudit(input.after ?? null) },
    payloadHash: hash,
    replayMethod: input.replay.method,
    replayPath: input.replay.path,
    // The request body may hold a provider key, so it is encrypted at rest and never sent to a browser.
    replayBody: encryptValue(JSON.stringify(stable(input.replay.body))),
    requestedBy: input.admin.email || null,
    requestedById: input.admin.id || null,
    requestedByName: input.admin.name || null,
    requestedByRole: input.admin.role || null,
    reason,
    status: 'pending' as ApprovalStatus,
    decidedBy: null as string | null,
    decidedById: null as string | null,
    decidedAt: null as Date | null,
    decisionReason: null as string | null,
    executedBy: null as string | null,
    executedAt: null as Date | null,
    ip: input.ip || null,
    userAgent: input.userAgent || null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + APPROVAL_HOURS * 3600_000),
  };
  const inserted = await requests.insertOne(doc);
  const ref = approvalReference(inserted.insertedId);

  await logAudit({
    admin: input.admin,
    action: 'approval_requested',
    module: 'security',
    entityType: 'approval-request',
    entityId: String(inserted.insertedId),
    entityLabel: `${action.label}: ${input.entityLabel || input.entityType}`,
    before: doc.summary.before,
    after: doc.summary.after,
    reason,
    meta: { action: input.action, targetType: input.entityType, targetId: entityId, expiresAt: doc.expiresAt },
  });

  return {
    proceed: false,
    status: 202,
    message: `Not changed yet. "${action.label}" needs a second approver, so the change was sent for approval (${ref}). ${who[0].toUpperCase() + who.slice(1)} must approve it under Security & Audit, Approvals within ${APPROVAL_HOURS} hours; it can then be carried out from that screen or by saving the same change again.`,
    approvalId: String(inserted.insertedId),
    code: 'approval_pending',
  };
}

/** The HTTP answer for a change that was held back. `success` is false: nothing was changed. */
export function approvalHeldResponse(result: Extract<GateResult, { proceed: false }>) {
  return NextResponse.json(
    {
      success: false,
      approvalRequired: result.code === 'approval_pending',
      approvalId: result.approvalId,
      code: result.code,
      error: result.message,
      message: result.message,
    },
    { status: result.status }
  );
}

/** The stored request that performs an approved action. Server-side use only. */
export function replayOf(approval: any): ReplayRequest | null {
  const text = decryptValue(approval?.replayBody);
  if (!text) return null;
  try {
    return { method: approval.replayMethod, path: approval.replayPath, body: JSON.parse(text) };
  } catch {
    return null;
  }
}

/** What a browser may see of an approval request. Never the stored request body. */
export function publicApproval(doc: any, viewer: AdminIdentity) {
  const action = sensitiveAction(doc.action);
  const own = sameAdmin(doc, 'requested', viewer);
  const live = doc.status === 'pending' || doc.status === 'approved';
  return {
    id: String(doc._id),
    reference: approvalReference(doc._id),
    action: doc.action,
    actionLabel: action?.label || doc.actionLabel || doc.action,
    module: doc.module,
    needs: doc.superOnly ? 'A different Super Admin' : `A different admin with ${doc.permission}`,
    entityType: doc.entityType,
    entityId: doc.entityId,
    entityLabel: doc.entityLabel,
    summary: doc.summary,
    requestedBy: doc.requestedBy,
    requestedByName: doc.requestedByName,
    requestedByRole: doc.requestedByRole,
    reason: doc.reason,
    status: doc.status as ApprovalStatus,
    decidedBy: doc.decidedBy,
    decidedAt: doc.decidedAt,
    decisionReason: doc.decisionReason,
    executedBy: doc.executedBy,
    executedAt: doc.executedAt,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    expired: live && new Date(doc.expiresAt).getTime() <= Date.now(),
    isOwnRequest: own,
    canDecide: doc.status === 'pending' && !own && mayDecide(viewer, action),
    canExecute: doc.status === 'approved' && (own || sameAdmin(doc, 'decided', viewer)),
  };
}

export { SENSITIVE_ACTIONS, sameAdmin as isSameAdmin };
