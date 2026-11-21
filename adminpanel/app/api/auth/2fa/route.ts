import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { AUTH_COOKIE, accountRestriction, authCookieOptions, clientIp, requireAdmin, resignAdminToken } from '@/lib/auth';
import { ok, fail } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { decryptValue, encryptValue } from '@/lib/crypto';
import { generateRecoveryCodes, generateTotpSecret, otpauthUri, recoveryCodeRecords, verifyTotp } from '@/lib/totp';
import { getSecuritySettings, recordSecurityEvent, twoFactorRequiredFor } from '@/lib/security-settings';
import { readBody } from '@/app/api/admin/security/_shared';

export const dynamic = 'force-dynamic';

/**
 * Two-factor authentication for the signed-in admin.
 *
 *  POST { action: 'setup' }                    -> a new secret to add to an authenticator app
 *  POST { action: 'enable', code }             -> confirms the secret, turns 2FA on and returns
 *                                                 ten recovery codes, shown this once
 *  POST { action: 'recovery_codes', password } -> replaces the recovery codes with ten new ones
 *  POST { action: 'disable', password }        -> turns 2FA off (refused while the role requires it)
 *
 * Recovery codes are stored as hashes; each works once at sign-in in place of
 * an authenticator code.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;
  const { admin } = check;

  const body = await readBody(request);
  const action = typeof body.action === 'string' ? body.action : '';

  const { db } = await connectToDatabase();
  const admins = db.collection('admins');
  const account = await admins.findOne({ _id: new ObjectId(admin.id) });
  if (!account) return fail('Account not found', 404);

  // A temporary password is replaced before anything else is set up.
  if (account.mustChangePassword) return fail('Choose your own password first, then set up two-factor authentication.', 409);

  const ip = clientIp(request);
  const userAgent = request.headers.get('user-agent');
  const event = (type: string, detail: string) =>
    recordSecurityEvent(db, { type, adminId: admin.id, adminEmail: admin.email, adminName: admin.name, ip, userAgent, detail });
  const audit = (verb: string, before: any, after: any, reason: string) =>
    logAudit({ admin, action: verb, module: 'security', entityType: 'admin', entityId: admin.id, entityLabel: admin.email, before, after, reason, request });

  if (action === 'setup') {
    if (account.twoFactorEnabled) return fail('Two-factor authentication is already on');
    const secret = generateTotpSecret();
    await admins.updateOne(
      { _id: account._id },
      { $set: { twoFactorPendingSecret: encryptValue(secret), updatedAt: new Date() } }
    );
    return ok({ secret, uri: otpauthUri(secret, account.email) });
  }

  if (action === 'enable') {
    if (account.twoFactorEnabled) return fail('Two-factor authentication is already on');
    const pending = decryptValue(account.twoFactorPendingSecret);
    if (!pending) return fail('Start the setup first');
    const code = typeof body.code === 'string' ? body.code : '';
    if (!verifyTotp(pending, code)) return fail('That code is not valid. Enter the current 6-digit code.');

    const recoveryCodes = generateRecoveryCodes();
    await admins.updateOne(
      { _id: account._id },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorSecret: encryptValue(pending),
          twoFactorEnabledAt: new Date(),
          recoveryCodes: recoveryCodeRecords(recoveryCodes),
          recoveryCodesCreatedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: { twoFactorPendingSecret: '' },
      }
    );
    await audit('2fa_enabled', { twoFactorEnabled: false }, { twoFactorEnabled: true, recoveryCodesIssued: recoveryCodes.length }, 'Turned on by the admin from My Account');
    await event('two_factor_enabled', 'The admin turned two-factor authentication on.');

    // Lifts the "2FA required" restriction carried in the session token.
    const settings = await getSecuritySettings(db);
    const restriction = accountRestriction({ ...account, twoFactorEnabled: true }, admin.role, settings);
    const response = ok({
      message: 'Two-factor authentication is now on. Save your recovery codes: they are shown only now.',
      recoveryCodes,
      restriction,
    });
    const signed = resignAdminToken(admin, { lim: restriction });
    response.cookies.set(AUTH_COOKIE, signed.token, authCookieOptions(signed.maxAge));
    return response;
  }

  if (action === 'recovery_codes') {
    if (!account.twoFactorEnabled) return fail('Turn two-factor authentication on first');
    const password = typeof body.password === 'string' ? body.password : '';
    if (!(await bcrypt.compare(password, account.password || ''))) return fail('The password is not correct', 400);

    const before: any[] = Array.isArray(account.recoveryCodes) ? account.recoveryCodes : [];
    const recoveryCodes = generateRecoveryCodes();
    await admins.updateOne(
      { _id: account._id },
      { $set: { recoveryCodes: recoveryCodeRecords(recoveryCodes), recoveryCodesCreatedAt: new Date(), updatedAt: new Date() } }
    );
    await audit(
      'recovery_codes_regenerated',
      { unusedCodes: before.filter((item) => !item.usedAt).length },
      { unusedCodes: recoveryCodes.length },
      'Regenerated by the admin from My Account'
    );
    await event('recovery_codes_regenerated', 'The admin replaced their recovery codes. The old codes no longer work.');
    return ok({ message: 'New recovery codes created. The old ones no longer work.', recoveryCodes });
  }

  if (action === 'disable') {
    if (!account.twoFactorEnabled) return fail('Two-factor authentication is not on');
    const settings = await getSecuritySettings(db);
    if (twoFactorRequiredFor(settings, admin.role)) {
      return fail('Two-factor authentication is required for your role and cannot be turned off.', 409);
    }
    const password = typeof body.password === 'string' ? body.password : '';
    if (!(await bcrypt.compare(password, account.password || ''))) return fail('The password is not correct', 400);

    await admins.updateOne(
      { _id: account._id },
      {
        $set: { twoFactorEnabled: false, updatedAt: new Date() },
        $unset: { twoFactorSecret: '', twoFactorPendingSecret: '', recoveryCodes: '', recoveryCodesCreatedAt: '', twoFactorEnabledAt: '' },
      }
    );
    await audit('2fa_disabled', { twoFactorEnabled: true }, { twoFactorEnabled: false }, 'Turned off by the admin from My Account');
    await event('two_factor_disabled', 'The admin turned two-factor authentication off. Sign-in now needs the password only.');
    return ok({ message: 'Two-factor authentication is now off.' });
  }

  return fail('Unknown action');
}
