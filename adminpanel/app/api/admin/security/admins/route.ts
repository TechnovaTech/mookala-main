import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp, requireAdmin } from '@/lib/auth';
import { ROLES } from '@/lib/permissions';
import { ok, fail, asString } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { approvalHeldResponse, gateSensitiveAction } from '@/lib/approvals';
import { recordSecurityEvent } from '@/lib/security-settings';
import { generateTemporaryPassword, isSuperAdmin, isValidPermission, publicAdmin, readBody } from '../_shared';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'security:view');
  if (!check.ok) return check.response;

  const { db } = await connectToDatabase();
  const [admins, sessionRows] = await Promise.all([
    db
      .collection('admins')
      .find({}, { projection: { password: 0, twoFactorSecret: 0, twoFactorPendingSecret: 0 } })
      .sort({ createdAt: 1 })
      .toArray(),
    db
      .collection('adminSessions')
      .aggregate([
        { $match: { revokedAt: null, expiresAt: { $gt: new Date() } } },
        { $group: { _id: '$adminId', count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const sessions = new Map(sessionRows.map((row) => [String(row._id), row.count as number]));

  return ok({
    admins: admins.map((doc) => ({ ...publicAdmin(doc, check.admin.id), activeSessions: sessions.get(String(doc._id)) || 0 })),
    canManage: isSuperAdmin(check.admin),
  });
}

/** Creates an admin with a temporary password. Super Admin only. */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'security:manage');
  if (!check.ok) return check.response;
  if (!isSuperAdmin(check.admin)) return fail('Only a Super Admin can create admin accounts.', 403);

  const body = await readBody(request);
  const email = asString(body.email, 200).toLowerCase();
  const name = asString(body.name, 80);
  const role = asString(body.role, 40);
  const reason = asString(body.reason, 500);

  if (!EMAIL.test(email)) return fail('Enter a valid email address.');
  if (!name) return fail('Name is required.');
  if (!ROLES.some((item) => item.value === role)) return fail('Choose a valid role.');
  if (!reason) return fail('A reason is required. It is saved in the activity log.');

  const requested = body.extraPermissions === undefined ? [] : body.extraPermissions;
  if (!Array.isArray(requested) || !requested.every(isValidPermission)) {
    return fail('One or more extra permissions are not valid.');
  }
  // A Super Admin already holds every permission.
  const extraPermissions = role === 'super_admin' ? [] : [...new Set(requested as string[])].sort();

  const { db } = await connectToDatabase();
  const admins = db.collection('admins');

  if (await admins.findOne({ email }, { projection: { _id: 1 } })) {
    return fail('An admin with this email already exists.', 409);
  }

  // A second Super Admin, when the security settings ask for one ("admin_create").
  const proposed = { email, name, role, extraPermissions };
  const gate = await gateSensitiveAction(db, {
    action: 'admin_create',
    admin: check.admin,
    entityType: 'admin',
    entityId: null,
    entityLabel: email,
    before: null,
    after: proposed,
    payload: proposed,
    reason,
    approvalId: asString(body.approvalId, 40) || null,
    replay: { method: 'POST', path: '/api/admin/security/admins', body: { ...proposed, reason } },
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent'),
  });
  if (!gate.proceed) return approvalHeldResponse(gate);

  const temporaryPassword = generateTemporaryPassword();
  const now = new Date();
  const doc = {
    email,
    name,
    role,
    extraPermissions,
    status: 'active',
    password: await bcrypt.hash(temporaryPassword, 12),
    mustChangePassword: true,
    twoFactorEnabled: false,
    createdAt: now,
    updatedAt: now,
    createdBy: check.admin.email || null,
  };

  let insertedId;
  try {
    insertedId = (await admins.insertOne(doc)).insertedId;
  } catch (error: any) {
    if (error?.code === 11000) return fail('An admin with this email already exists.', 409);
    console.error('Create admin failed:', error);
    return fail('The admin could not be created.', 500);
  }

  await logAudit({
    admin: check.admin,
    action: 'create',
    module: 'security',
    entityType: 'admin',
    entityId: String(insertedId),
    entityLabel: email,
    after: { email, name, role, extraPermissions, status: 'active', mustChangeAtNextSignIn: true },
    reason,
    meta: gate.approval ? { approvalId: String(gate.approval._id), requestedBy: gate.approval.requestedBy, approvedBy: gate.approval.decidedBy } : undefined,
    request,
  });
  await recordSecurityEvent(db, {
    type: 'admin_created',
    adminId: String(insertedId),
    adminEmail: email,
    adminName: name,
    actorEmail: check.admin.email || null,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent'),
    detail: `${check.admin.email || 'A Super Admin'} created this admin account with the role ${ROLES.find((item) => item.value === role)?.label || role}${extraPermissions.length ? ` and ${extraPermissions.length} extra permission${extraPermissions.length === 1 ? '' : 's'}` : ''}.`,
    meta: { role, extraPermissions },
  });

  return ok(
    {
      admin: publicAdmin({ ...doc, _id: insertedId }, check.admin.id),
      temporaryPassword,
      message: 'Admin created. Give them the temporary password now: it is not stored and cannot be shown again.',
    },
    { status: 201 }
  );
}
