import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp, requireAdmin } from '@/lib/auth';
import { ROLES, normaliseRole } from '@/lib/permissions';
import { ok, fail, asString } from '@/lib/http';
import { diff, logAudit } from '@/lib/audit';
import {
  SECURITY_LIMITS,
  SENSITIVE_ACTIONS,
  getSecuritySettings,
  ipInList,
  ipRuleDisabledByEnvironment,
  normaliseIp,
  recordSecurityEvent,
  saveSecuritySettings,
  securityAuditShape,
  securityDefaults,
  validateSecuritySettings,
} from '@/lib/security-settings';
import { activeSuperAdminCount, approvalHeldResponse, approvalReference, gateSensitiveAction } from '@/lib/approvals';
import { isSuperAdmin } from '../_shared';

export const dynamic = 'force-dynamic';

const LABELS: Record<string, string> = {
  sessionHours: 'Session length (hours)',
  idleTimeoutMinutes: 'Idle timeout (minutes)',
  maxSessions: 'Maximum sessions per admin',
  twoFactorRequiredRoles: '2FA required for',
  ipAllowlistEnabled: 'IP allow-list on',
  ipAllowlist: 'IP allow-list',
  ipAllowlistRoles: 'IP allow-list applies to',
  approvalActions: 'Actions that need a second approver',
};

/**
 * Security settings (requirements section 16).
 *
 *   GET                       any admin with security:view
 *   PUT { settings, reason, confirmLockout?, approvalId? }   Super Admin only
 *
 * A save is refused when the IP allow-list would shut out the address the
 * saving admin is using, unless `confirmLockout` is true; and when it switches
 * on a second approver for an action only a Super Admin may approve while
 * fewer than two Super Admins are active. The save itself can need a second
 * Super Admin (sensitive action "security_settings").
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'security:view');
  if (!check.ok) return check.response;

  const { db } = await connectToDatabase();
  const [settings, superAdmins, history, pending] = await Promise.all([
    getSecuritySettings(db),
    activeSuperAdminCount(db),
    db.collection('auditLogs').find({ entityType: 'security-settings' }).sort({ createdAt: -1 }).limit(20).toArray(),
    db
      .collection('approvalRequests')
      .find({ action: 'security_settings', status: { $in: ['pending', 'approved'] }, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray(),
  ]);

  const ip = normaliseIp(clientIp(request));
  const role = normaliseRole(check.admin.role);

  return ok({
    settings,
    defaults: securityDefaults(),
    limits: SECURITY_LIMITS,
    roles: ROLES.map((item) => ({ value: item.value, label: item.label })),
    sensitiveActions: SENSITIVE_ACTIONS.map((action) => ({
      key: action.key,
      label: action.label,
      description: action.description,
      superOnly: action.superOnly,
      permission: action.permission,
      defaultOn: action.defaultOn,
    })),
    activeSuperAdmins: superAdmins,
    breakGlass: {
      variable: 'SECURITY_IP_ALLOWLIST_DISABLED',
      value: 'true',
      active: ipRuleDisabledByEnvironment(),
    },
    you: {
      ip,
      role,
      ipOnList: ipInList(ip, settings.ipAllowlist),
    },
    pendingApprovals: pending.map((doc) => ({
      id: String(doc._id),
      reference: approvalReference(doc._id),
      status: doc.status,
      requestedBy: doc.requestedBy,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
    })),
    history: history.map((entry) => ({
      id: String(entry._id),
      action: entry.action,
      adminName: entry.adminName,
      adminEmail: entry.adminEmail,
      before: entry.before,
      after: entry.after,
      reason: entry.reason,
      createdAt: entry.createdAt,
    })),
    canManage: isSuperAdmin(check.admin),
  });
}

export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request, 'security:manage');
  if (!check.ok) return check.response;
  if (!isSuperAdmin(check.admin)) return fail('Only a Super Admin can change the security settings.', 403);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid request body');

  const reason = asString(body.reason, 500);
  if (reason.length < 5) return fail('Write a reason of at least 5 characters. It is saved in the activity log.');

  const { db } = await connectToDatabase();
  const current = await getSecuritySettings(db);
  const checked = validateSecuritySettings(current, body.settings);
  if (!checked.ok) return fail(checked.error);
  const next = checked.value;

  // 1. Never let the saving admin shut themselves out without saying so.
  const ip = normaliseIp(clientIp(request));
  const role = normaliseRole(check.admin.role);
  const ruleCoversMe = next.ipAllowlistEnabled && Boolean(role && next.ipAllowlistRoles.includes(role));
  if (ruleCoversMe && !ipInList(ip, next.ipAllowlist) && body.confirmLockout !== true) {
    return fail(
      `The allow-list does not include the address you are using now (${ip}). Saving it would sign you out and stop you signing in again from here. Add your address, or tick the confirmation to save anyway.`,
      409,
      { code: 'would_lock_out', needsLockoutConfirmation: true, ip }
    );
  }

  // 2. An action only a Super Admin can approve cannot need a second approver while there is only one.
  const superAdmins = await activeSuperAdminCount(db);
  for (const action of SENSITIVE_ACTIONS) {
    if (!action.superOnly) continue;
    const switchingOn = next.approvalActions[action.key] && !current.approvalActions[action.key];
    if (switchingOn && superAdmins < 2) {
      return fail(
        `"${action.label}" can only be approved by a different Super Admin, and ${superAdmins === 1 ? 'only one Super Admin is' : 'no Super Admin is'} active. Nobody could approve it, so it cannot be switched on yet. Add or enable a second Super Admin under Admins & Roles first.`,
        409,
        { code: 'needs_second_super_admin', action: action.key, activeSuperAdmins: superAdmins }
      );
    }
  }

  const changes = diff(securityAuditShape(current), securityAuditShape(next));
  if (Object.keys(changes.after).length === 0) return ok({ settings: current, unchanged: true, message: 'Nothing was changed.' });

  // 3. The save itself may need a second Super Admin.
  const gate = await gateSensitiveAction(db, {
    action: 'security_settings',
    admin: check.admin,
    entityType: 'security-settings',
    entityId: 'security',
    entityLabel: 'Security settings',
    before: changes.before,
    after: changes.after,
    payload: securityAuditShape(next),
    reason,
    approvalId: asString(body.approvalId, 40) || null,
    replay: {
      method: 'PUT',
      path: '/api/admin/security/settings',
      body: { settings: body.settings, reason, confirmLockout: body.confirmLockout === true },
    },
    ip,
    userAgent: request.headers.get('user-agent'),
  });
  if (!gate.proceed) return approvalHeldResponse(gate);

  const saved = await saveSecuritySettings(db, next, check.admin.email || null);

  await logAudit({
    admin: check.admin,
    action: 'update',
    module: 'security',
    entityType: 'security-settings',
    entityId: 'security',
    entityLabel: 'Security settings',
    before: changes.before,
    after: changes.after,
    reason,
    meta: gate.approval
      ? { approvalId: String(gate.approval._id), requestedBy: gate.approval.requestedBy, approvedBy: gate.approval.decidedBy }
      : { lockoutConfirmed: body.confirmLockout === true || undefined },
    request,
  });

  const changed = Object.keys(changes.after).map((key) => LABELS[key] || key);
  await recordSecurityEvent(db, {
    type: 'security_settings_changed',
    adminId: check.admin.id,
    adminEmail: check.admin.email,
    adminName: check.admin.name,
    ip,
    userAgent: request.headers.get('user-agent'),
    detail: `Security settings changed: ${changed.join(', ')}.`,
    meta: { changed: Object.keys(changes.after) },
  });

  return ok({
    settings: saved,
    message:
      'Security settings saved. New sign-ins use the new session length; sessions already open keep the expiry they were given. The idle timeout, IP rule and 2FA rule apply from the next request.',
  });
}
