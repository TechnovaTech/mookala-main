import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { AUTH_COOKIE, accountRestriction, authCookieOptions, clientIp, requireAdmin, resignAdminToken } from '@/lib/auth';
import { ok, fail } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { passwordProblem } from '@/lib/password';
import { getSecuritySettings, recordSecurityEvent } from '@/lib/security-settings';
import { readBody } from '@/app/api/admin/security/_shared';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  const { admin } = check;

  const body = await readBody(request);
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = typeof body.newPassword === 'string' ? body.newPassword : '';

  const problem = passwordProblem(next, admin.email);
  if (problem) return fail(problem);
  if (current === next) return fail('The new password must be different from the current one');

  const { db } = await connectToDatabase();
  const account = await db.collection('admins').findOne({ _id: new ObjectId(admin.id) });
  if (!account) return fail('Account not found', 404);

  const valid = await bcrypt.compare(current, account.password || '');
  if (!valid) return fail('The current password is not correct', 400);

  const wasTemporary = Boolean(account.mustChangePassword);
  await db.collection('admins').updateOne(
    { _id: account._id },
    {
      $set: {
        password: await bcrypt.hash(next, 12),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  // Sign out every other device that was using the old password.
  const ended = await db
    .collection('adminSessions')
    .updateMany(
      { adminId: admin.id, sid: { $ne: admin.sid }, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'password_changed', revokedBy: admin.email || 'admin' } }
    );

  await logAudit({
    admin,
    action: 'password_change',
    module: 'security',
    entityType: 'admin',
    entityId: admin.id,
    entityLabel: admin.email,
    before: { temporaryPassword: wasTemporary },
    after: { temporaryPassword: false, otherSessionsEnded: ended.modifiedCount },
    reason: wasTemporary ? 'Temporary password replaced at first sign-in' : 'Changed by the admin from My Account',
    request,
  });
  await recordSecurityEvent(db, {
    type: 'password_changed',
    adminId: admin.id,
    adminEmail: admin.email,
    adminName: admin.name,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent'),
    detail: wasTemporary
      ? 'The admin replaced their temporary password with their own.'
      : `The admin changed their own password. ${ended.modifiedCount} other session${ended.modifiedCount === 1 ? '' : 's'} ended.`,
  });

  // The restriction carried in the session token is lifted or moves on to the next step.
  const settings = await getSecuritySettings(db);
  const restriction = accountRestriction({ ...account, mustChangePassword: false }, admin.role, settings);
  const response = ok({
    message: 'Password changed. Other devices have been signed out.',
    restriction,
    twoFactorSetupRequired: restriction === 'two_factor_setup',
  });
  const signed = resignAdminToken(admin, { lim: restriction });
  response.cookies.set(AUTH_COOKIE, signed.token, authCookieOptions(signed.maxAge));
  return response;
}
