import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp, requireAdmin } from '@/lib/auth';
import { ROLES, normaliseRole } from '@/lib/permissions';
import { ok, fail, asString, toObjectId } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { approvalHeldResponse, gateSensitiveAction } from '@/lib/approvals';
import { recordSecurityEvent } from '@/lib/security-settings';
import {
  SUPER_ROLE_VALUES,
  generateTemporaryPassword,
  isSuperAdmin,
  isValidPermission,
  publicAdmin,
  readBody,
  revokeSessionsOf,
} from '../../_shared';

export const dynamic = 'force-dynamic';

/**
 * Changes to one admin account.
 *
 *   PATCH { action: 'update', name?, role?, extraPermissions?, reason }   Super Admin only
 *   PATCH { action: 'disable' | 'enable', reason }
 *   PATCH { action: 'reset_password', reason }   -> returns a temporary password once
 *   PATCH { action: 'reset_2fa', reason }
 *
 * Every action needs `security:manage` and a reason. Only a Super Admin may
 * change roles or permissions, or act on another Super Admin's account.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'security:manage');
  if (!check.ok) return check.response;
  const caller = check.admin;
  const callerIsSuper = isSuperAdmin(caller);

  const id = toObjectId(params.id);
  if (!id) return fail('That admin id is not valid.');

  const body = await readBody(request);
  const action = asString(body.action, 40);
  const reason = asString(body.reason, 500);

  if (!['update', 'disable', 'enable', 'reset_password', 'reset_2fa'].includes(action)) return fail('Unknown action.');
  if (!reason) return fail('A reason is required. It is saved in the activity log.');

  const { db } = await connectToDatabase();
  const admins = db.collection('admins');
  const target = await admins.findOne({ _id: id });
  if (!target) return fail('Admin not found.', 404);

  const targetId = String(target._id);
  const isSelf = targetId === caller.id;
  const targetIsSuper = normaliseRole(target.role) === 'super_admin';
  const targetActive = target.status !== 'disabled';

  if (action === 'update' && !callerIsSuper) return fail('Only a Super Admin can change roles and permissions.', 403);
  if (targetIsSuper && !callerIsSuper) return fail("Only a Super Admin can change a Super Admin's account.", 403);

  /** True when at least one other active Super Admin would remain. */
  const anotherSuperRemains = async () =>
    (await admins.countDocuments({
      _id: { $ne: target._id },
      role: { $in: SUPER_ROLE_VALUES },
      status: { $ne: 'disabled' },
    })) > 0;

  const actor = caller.email || 'admin';
  let approval: any = null;
  const approvalMeta = () =>
    approval ? { approvalId: String(approval._id), requestedBy: approval.requestedBy, approvedBy: approval.decidedBy } : {};
  const audit = (verb: string, before: any, after: any, meta?: Record<string, any>) =>
    logAudit({
      admin: caller,
      action: verb,
      module: 'security',
      entityType: 'admin',
      entityId: targetId,
      entityLabel: target.email,
      before,
      after,
      reason,
      meta: { ...(meta || {}), ...approvalMeta() },
      request,
    });
  const event = (type: string, detail: string, meta?: Record<string, any>) =>
    recordSecurityEvent(db, {
      type,
      adminId: targetId,
      adminEmail: target.email,
      adminName: target.name,
      actorEmail: caller.email || null,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      detail,
      meta: meta || null,
    });
  /** Holds the change for a second Super Admin when the security settings ask for one. */
  const hold = (key: 'admin_role_change' | 'admin_disable', before: any, after: any, payload: any) => {
    const { approvalId: _ignored, ...replayBody } = body as Record<string, any>;
    return gateSensitiveAction(db, {
      action: key,
      admin: caller,
      entityType: 'admin',
      entityId: targetId,
      entityLabel: target.email,
      before,
      after,
      payload,
      reason,
      approvalId: asString(body.approvalId, 40) || null,
      replay: { method: 'PATCH', path: `/api/admin/security/admins/${targetId}`, body: replayBody },
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    });
  };

  /* ------------------------------ update ------------------------------ */
  if (action === 'update') {
    const set: Record<string, any> = {};
    const before: Record<string, any> = {};
    const after: Record<string, any> = {};

    if (body.name !== undefined) {
      const name = asString(body.name, 80);
      if (!name) return fail('Name is required.');
      if (name !== (target.name || '')) {
        set.name = name;
        before.name = target.name || '';
        after.name = name;
      }
    }

    const currentRole = normaliseRole(target.role);
    let nextRole = currentRole;
    if (body.role !== undefined) {
      const role = asString(body.role, 40);
      if (!ROLES.some((item) => item.value === role)) return fail('Choose a valid role.');
      nextRole = role as typeof currentRole;
    }

    if (nextRole !== currentRole) {
      if (targetIsSuper) {
        if (isSelf) return fail('You cannot change your own role. Ask another Super Admin.', 409);
        if (targetActive && !(await anotherSuperRemains())) {
          return fail('This is the last active Super Admin. Make another admin a Super Admin first.', 409);
        }
      }
      set.role = nextRole;
      before.role = currentRole;
      after.role = nextRole;
    }

    const currentPerms: string[] = Array.isArray(target.extraPermissions) ? [...target.extraPermissions].sort() : [];
    let nextPerms = currentPerms;
    if (body.extraPermissions !== undefined) {
      if (!Array.isArray(body.extraPermissions) || !body.extraPermissions.every(isValidPermission)) {
        return fail('One or more extra permissions are not valid.');
      }
      nextPerms = [...new Set(body.extraPermissions as string[])].sort();
    }
    if (nextRole === 'super_admin') nextPerms = [];
    if (JSON.stringify(nextPerms) !== JSON.stringify(currentPerms)) {
      set.extraPermissions = nextPerms;
      before.extraPermissions = currentPerms;
      after.extraPermissions = nextPerms;
    }

    if (Object.keys(set).length === 0) return fail('Nothing was changed.');

    if (set.role !== undefined || set.extraPermissions !== undefined) {
      const gate = await hold('admin_role_change', before, after, { action: 'update', set });
      if (!gate.proceed) return approvalHeldResponse(gate);
      approval = gate.approval;
    }

    await admins.updateOne({ _id: target._id }, { $set: { ...set, updatedAt: new Date() } });

    // The role and permissions are carried in the session token, so a change
    // only takes effect at the next sign-in. End the admin's sessions now.
    let sessionsEnded = 0;
    if (!isSelf && (set.role !== undefined || set.extraPermissions !== undefined)) {
      sessionsEnded = await revokeSessionsOf(db, targetId, 'role_changed', actor);
    }

    await audit(set.role !== undefined ? 'role_change' : 'update', before, after, { sessionsEnded });
    if (set.role !== undefined) {
      await event('role_changed', `Role changed from ${ROLES.find((r) => r.value === before.role)?.label || before.role} to ${ROLES.find((r) => r.value === after.role)?.label || after.role} by ${actor}.`, { before: before.role, after: after.role });
    }
    if (set.extraPermissions !== undefined) {
      await event('permissions_changed', `Extra permissions changed by ${actor}: ${(after.extraPermissions || []).join(', ') || 'none'}.`, {
        before: before.extraPermissions,
        after: after.extraPermissions,
      });
    }
    const fresh = await admins.findOne({ _id: target._id });
    return ok({
      admin: publicAdmin(fresh, caller.id),
      message: sessionsEnded
        ? `Saved. ${sessionsEnded} active session${sessionsEnded === 1 ? ' was' : 's were'} ended so the change applies at the next sign-in.`
        : 'Saved.',
    });
  }

  /* ------------------------- disable / enable -------------------------- */
  if (action === 'disable') {
    if (isSelf) return fail('You cannot disable your own account.', 409);
    if (!targetActive) return fail('This account is already disabled.');
    if (targetIsSuper && !(await anotherSuperRemains())) {
      return fail('This is the last active Super Admin and cannot be disabled.', 409);
    }
    const gate = await hold('admin_disable', { status: 'active' }, { status: 'disabled' }, { action: 'disable' });
    if (!gate.proceed) return approvalHeldResponse(gate);
    approval = gate.approval;
    await admins.updateOne(
      { _id: target._id },
      { $set: { status: 'disabled', disabledAt: new Date(), disabledBy: actor, updatedAt: new Date() } }
    );
    const sessionsEnded = await revokeSessionsOf(db, targetId, 'account_disabled', actor);
    await audit('disable', { status: 'active' }, { status: 'disabled' }, { sessionsEnded });
    await event('admin_disabled', `Account disabled by ${actor}. ${sessionsEnded} active session${sessionsEnded === 1 ? '' : 's'} ended.`);
    return ok({ message: `Account disabled. ${sessionsEnded} active session${sessionsEnded === 1 ? '' : 's'} ended.` });
  }

  if (action === 'enable') {
    if (targetActive) return fail('This account is already active.');
    await admins.updateOne(
      { _id: target._id },
      { $set: { status: 'active', updatedAt: new Date() }, $unset: { disabledAt: '', disabledBy: '' } }
    );
    await audit('enable', { status: 'disabled' }, { status: 'active' });
    await event('admin_enabled', `Account enabled again by ${actor}.`);
    return ok({ message: 'Account enabled.' });
  }

  /* --------------------------- reset password -------------------------- */
  if (action === 'reset_password') {
    if (isSelf) return fail('Use My Account to change your own password.', 409);
    const temporaryPassword = generateTemporaryPassword();
    await admins.updateOne(
      { _id: target._id },
      {
        $set: {
          password: await bcrypt.hash(temporaryPassword, 12),
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
    const sessionsEnded = await revokeSessionsOf(db, targetId, 'password_reset', actor);
    // The password itself is never written to the log.
    await audit('password_reset', null, { credentialReset: true, mustChangeAtNextSignIn: true }, { sessionsEnded });
    await event('password_reset', `Password reset by ${actor}. A temporary password was issued and ${sessionsEnded} session${sessionsEnded === 1 ? ' was' : 's were'} ended.`);
    return ok({
      temporaryPassword,
      message: `Password reset. ${sessionsEnded} active session${sessionsEnded === 1 ? '' : 's'} ended. Give the admin the temporary password now: it cannot be shown again.`,
    });
  }

  /* ------------------------------ reset 2FA ---------------------------- */
  if (isSelf) return fail('Use My Account to turn your own two-factor authentication off.', 409);
  if (!target.twoFactorEnabled && !target.twoFactorPendingSecret) {
    return fail('Two-factor authentication is not on for this account.');
  }
  await admins.updateOne(
    { _id: target._id },
    {
      $set: { twoFactorEnabled: false, updatedAt: new Date() },
      $unset: { twoFactorSecret: '', twoFactorPendingSecret: '', recoveryCodes: '', recoveryCodesCreatedAt: '' },
    }
  );
  await audit('2fa_reset', { twoFactorEnabled: Boolean(target.twoFactorEnabled) }, { twoFactorEnabled: false });
  await event('two_factor_reset', `Two-factor authentication turned off by ${actor}. Sign-in needs the password only until it is set up again.`);
  return ok({ message: 'Two-factor authentication was turned off for this account. They can set it up again from My Account.' });
}
