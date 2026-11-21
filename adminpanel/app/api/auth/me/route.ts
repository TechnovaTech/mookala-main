import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { RESTRICTION_MESSAGES, accountRestriction, clientIp, requireAdmin } from '@/lib/auth';
import { permissionsFor } from '@/lib/permissions';
import { ok, fail } from '@/lib/http';
import { diff, logAudit } from '@/lib/audit';
import { getSecuritySettings, twoFactorRequiredFor } from '@/lib/security-settings';
import { readBody } from '@/app/api/admin/security/_shared';

export const dynamic = 'force-dynamic';

/**
 * The signed-in admin, as the page shell needs it.
 *
 * `restriction` is 'password_change' or 'two_factor_setup' while the account
 * may only use My Account: every other admin API answers 403 with the same
 * code until the admin has chosen their own password or turned 2FA on.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  const { admin } = check;

  const { db } = await connectToDatabase();
  const [account, settings] = await Promise.all([
    db
      .collection('admins')
      .findOne(
        { _id: new ObjectId(admin.id) },
        { projection: { name: 1, email: 1, role: 1, phone: 1, twoFactorEnabled: 1, mustChangePassword: 1, lastLoginAt: 1, recoveryCodes: 1, passwordChangedAt: 1 } }
      ),
    getSecuritySettings(db),
  ]);

  const restriction = accountRestriction(account, admin.role, settings);
  const codes: any[] = Array.isArray(account?.recoveryCodes) ? account!.recoveryCodes : [];

  return ok({
    admin: {
      id: admin.id,
      email: admin.email,
      name: account?.name || admin.name,
      phone: account?.phone || '',
      role: admin.role,
      perms: admin.perms || [],
      permissions: permissionsFor(admin),
      twoFactorEnabled: Boolean(account?.twoFactorEnabled),
      twoFactorRequired: twoFactorRequiredFor(settings, admin.role),
      recoveryCodesLeft: account?.twoFactorEnabled ? codes.filter((item) => !item.usedAt).length : null,
      mustChangePassword: Boolean(account?.mustChangePassword),
      restriction,
      restrictionMessage: restriction ? RESTRICTION_MESSAGES[restriction] : null,
      lastLoginAt: account?.lastLoginAt || null,
      passwordChangedAt: account?.passwordChangedAt || null,
    },
    session: {
      ip: clientIp(request),
      sessionHours: settings.sessionHours,
      idleTimeoutMinutes: settings.idleTimeoutMinutes,
      maxSessions: settings.maxSessions,
    },
  });
}

/** Lets an admin update their own display name and phone. */
export async function PUT(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  const { admin } = check;

  const body = await readBody(request);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : '';
  if (!name) return fail('Name is required');
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) return fail('Enter a valid phone number, or leave it empty');

  const { db } = await connectToDatabase();
  const admins = db.collection('admins');
  const existing = await admins.findOne({ _id: new ObjectId(admin.id) }, { projection: { name: 1, phone: 1 } });
  if (!existing) return fail('Account not found', 404);

  const changes = diff({ name: existing.name || '', phone: existing.phone || '' }, { name, phone });
  if (Object.keys(changes.after).length === 0) return ok({ message: 'Nothing was changed.', unchanged: true });

  await admins.updateOne({ _id: existing._id }, { $set: { name, phone, updatedAt: new Date() } });

  await logAudit({
    admin,
    action: 'update',
    module: 'security',
    entityType: 'admin',
    entityId: admin.id,
    entityLabel: admin.email,
    before: changes.before,
    after: changes.after,
    reason: 'Own profile updated from My Account',
    request,
  });

  return ok({ message: 'Profile updated. Sign in again to see the new name in the header.' });
}
