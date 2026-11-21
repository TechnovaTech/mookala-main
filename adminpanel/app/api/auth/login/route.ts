import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/mongodb';
import { AUTH_COOKIE, accountRestriction, authCookieOptions, clientIp, newSessionId, signAdminToken } from '@/lib/auth';
import { getJwtSecret } from '@/lib/jwt-edge';
import { logAudit } from '@/lib/audit';
import { decryptValue } from '@/lib/crypto';
import { hashRecoveryCode, looksLikeRecoveryCode, verifyTotp } from '@/lib/totp';
import { normaliseRole } from '@/lib/permissions';
import { getSecuritySettings, ipAllowedFor, normaliseIp, recordSecurityEvent } from '@/lib/security-settings';
import { LOCK_MAX_FAILURES, LOCK_MINUTES, WARN_FAILURES, lockCountFilter, readBody } from '@/app/api/admin/security/_shared';

export const dynamic = 'force-dynamic';

/**
 * A real bcrypt hash (cost 12, the cost used for admin passwords) of a random
 * value nobody knows. An unknown email is compared against it so that the
 * answer for "no such admin" takes as long as the answer for "wrong password".
 */
const DUMMY_HASH = bcrypt.hashSync('no-admin-has-this-password-' + newSessionId(), 12);

/**
 * Admin sign-in.
 *
 *   POST { email, password, code? }
 *
 * `code` is the 6-digit authenticator code or one recovery code, needed only
 * when the account has 2FA on. Every attempt is written to adminLoginHistory
 * with its result, reason, IP address and device.
 */
export async function POST(request: NextRequest) {
  try {
    if (!getJwtSecret()) {
      console.error('JWT_SECRET is not set. Admin sign-in is disabled until it is configured.');
      return NextResponse.json(
        { error: 'Sign-in is not configured on the server. Set JWT_SECRET and redeploy.' },
        { status: 500 }
      );
    }

    const body = await readBody(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const code = typeof body.code === 'string' ? body.code.trim().slice(0, 40) : '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const ip = normaliseIp(clientIp(request));
    const userAgent = (request.headers.get('user-agent') || '').slice(0, 400);
    const history = db.collection('adminLoginHistory');

    const record = (success: boolean, reason: string, extra: Record<string, any> = {}) =>
      history.insertOne({ email, success, reason, ip, userAgent, createdAt: new Date(), ...extra });

    // The lock is counted per email whether or not an admin has that email, so
    // the answer does not reveal which emails are admin accounts.
    if ((await history.countDocuments(lockCountFilter(email))) >= LOCK_MAX_FAILURES) {
      await record(false, 'locked');
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.` },
        { status: 429 }
      );
    }

    const admin = await db.collection('admins').findOne({ email });
    const known = Boolean(admin && typeof admin.password === 'string');

    /** Records a wrong credential and raises the "repeated" and "locked" events when their thresholds are reached. */
    const credentialFailure = async (reason: string) => {
      await record(false, reason);
      const failures = await history.countDocuments(lockCountFilter(email));
      if (failures === WARN_FAILURES || failures === LOCK_MAX_FAILURES) {
        const locked = failures === LOCK_MAX_FAILURES;
        await recordSecurityEvent(db, {
          type: locked ? 'account_locked' : 'failed_signins',
          adminId: known ? String(admin!._id) : null,
          adminEmail: email,
          adminName: known ? admin!.name : null,
          ip,
          userAgent,
          detail: locked
            ? `${failures} failed sign-in attempts within ${LOCK_MINUTES} minutes: sign-in with this email is locked for ${LOCK_MINUTES} minutes.`
            : `${failures} failed sign-in attempts within ${LOCK_MINUTES} minutes.`,
          meta: { failures, knownAccount: known, lastReason: reason },
        });
      }
    };

    // Same work, same answer and same status for an unknown email and for a wrong password.
    const passwordOk = await bcrypt.compare(password, known ? admin!.password : DUMMY_HASH);
    if (!known || !passwordOk || !admin) {
      await credentialFailure(known ? 'wrong_password' : 'unknown_account');
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // From here on the caller has proved they know the password.
    if (admin.status === 'disabled') {
      await record(false, 'disabled_account');
      return NextResponse.json({ error: 'This admin account is disabled.' }, { status: 403 });
    }

    const role = normaliseRole(admin.role);
    if (!role) {
      await record(false, 'no_role');
      return NextResponse.json({ error: 'This account has no role assigned.' }, { status: 403 });
    }

    const settings = await getSecuritySettings(db);

    if (!ipAllowedFor(settings, role, ip)) {
      await record(false, 'ip_not_allowed');
      await recordSecurityEvent(db, {
        type: 'signin_ip_refused',
        adminId: String(admin._id),
        adminEmail: email,
        adminName: admin.name,
        ip,
        userAgent,
        detail: `Sign-in with the correct password was refused because the address ${ip} is not on the IP allow-list.`,
      });
      return NextResponse.json(
        {
          error: `Sign-in is not allowed from your network address (${ip}). The admin panel can only be used from approved addresses. Ask a Super Admin to add yours under Security Settings.`,
          code: 'ip_not_allowed',
        },
        { status: 403 }
      );
    }

    let usedRecoveryCode = false;
    let recoveryCodesLeft: number | null = null;
    if (admin.twoFactorEnabled && admin.twoFactorSecret) {
      if (!code) {
        return NextResponse.json(
          { error: 'Enter the 6-digit code from your authenticator app.', twoFactorRequired: true },
          { status: 401 }
        );
      }

      if (looksLikeRecoveryCode(code)) {
        // One atomic update: the code is marked used only if it exists and is still unused.
        const used = await db.collection('admins').updateOne(
          { _id: admin._id, recoveryCodes: { $elemMatch: { hash: hashRecoveryCode(code), usedAt: null } } },
          { $set: { 'recoveryCodes.$.usedAt': new Date(), 'recoveryCodes.$.usedIp': ip } }
        );
        if (used.modifiedCount !== 1) {
          await credentialFailure('wrong_recovery_code');
          return NextResponse.json(
            { error: 'That recovery code is not valid or has already been used.', twoFactorRequired: true },
            { status: 401 }
          );
        }
        usedRecoveryCode = true;
        const codes: any[] = Array.isArray(admin.recoveryCodes) ? admin.recoveryCodes : [];
        recoveryCodesLeft = Math.max(0, codes.filter((item) => !item.usedAt).length - 1);
      } else {
        const secret = decryptValue(admin.twoFactorSecret);
        if (!secret || !verifyTotp(secret, code)) {
          await credentialFailure('wrong_2fa_code');
          return NextResponse.json(
            { error: 'That code is not valid. Try the current code.', twoFactorRequired: true },
            { status: 401 }
          );
        }
      }
    }

    // A device is an IP address plus a browser (user agent).
    const [seenDevice, seenIp, anySuccess] = await Promise.all([
      history.findOne({ email, success: true, ip, userAgent }, { projection: { _id: 1 } }),
      history.findOne({ email, success: true, ip }, { projection: { _id: 1 } }),
      history.findOne({ email, success: true }, { projection: { _id: 1 } }),
    ]);
    const newDevice = !seenDevice;
    const newIp = !seenIp;

    const sid = newSessionId();
    const now = new Date();
    const sessions = db.collection('adminSessions');
    const adminId = String(admin._id);

    // Sessions that have already gone idle are ended first, so they do not count towards the limit.
    await sessions.updateMany(
      { adminId, revokedAt: null, lastSeenAt: { $lt: new Date(now.getTime() - settings.idleTimeoutMinutes * 60_000) } },
      { $set: { revokedAt: now, revokedReason: 'idle_timeout', revokedBy: 'system' } }
    );

    await sessions.insertOne({
      sid,
      adminId,
      email,
      ip,
      userAgent,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + settings.sessionHours * 3600_000),
      revokedAt: null,
    });

    // Keep at most `maxSessions` live sessions: the least recently used are ended.
    const live = await sessions
      .find({ adminId, revokedAt: null, expiresAt: { $gt: now } }, { projection: { sid: 1 } })
      .sort({ lastSeenAt: -1, createdAt: -1 })
      .toArray();
    const surplus = live.slice(settings.maxSessions).map((session) => session.sid).filter((value) => value !== sid);
    if (surplus.length) {
      await sessions.updateMany(
        { sid: { $in: surplus } },
        { $set: { revokedAt: now, revokedReason: 'session_limit', revokedBy: 'system' } }
      );
    }

    const restriction = accountRestriction(admin, role, settings);
    const identity = {
      id: adminId,
      email,
      name: admin.name || email.split('@')[0],
      role: role as string,
      perms: Array.isArray(admin.extraPermissions) ? admin.extraPermissions : [],
      sid,
    };

    // `lim` marks a session that may only reach My Account until the
    // restriction is lifted. The server checks the account itself on every
    // request (requireAdmin); the claim lets the page middleware redirect.
    const token = signAdminToken({ ...identity, typ: 'admin', ...(restriction ? { lim: restriction } : {}) }, settings.sessionHours);

    await record(true, 'ok', { newDevice, newIp, sid, usedRecoveryCode });
    await db.collection('admins').updateOne({ _id: admin._id }, { $set: { lastLoginAt: now, lastLoginIp: ip } });
    await logAudit({
      admin: identity,
      action: 'login',
      module: 'security',
      entityType: 'admin',
      entityId: identity.id,
      entityLabel: email,
      meta: { newDevice, newIp, usedRecoveryCode, sessionsEndedByLimit: surplus.length },
      request,
    });

    if (newDevice || newIp) {
      await recordSecurityEvent(db, {
        type: newIp ? 'new_ip' : 'new_device',
        adminId,
        adminEmail: email,
        adminName: identity.name,
        ip,
        userAgent,
        detail: !anySuccess
          ? 'First sign-in recorded for this account.'
          : newIp
          ? `Sign-in from an IP address this admin has not used before (${ip}).`
          : 'Sign-in from a browser this admin has not used before on this IP address.',
        meta: { newDevice, newIp, firstSignIn: !anySuccess },
      });
    }
    if (usedRecoveryCode) {
      await recordSecurityEvent(db, {
        type: 'recovery_code_used',
        adminId,
        adminEmail: email,
        adminName: identity.name,
        ip,
        userAgent,
        detail: `A recovery code was used in place of an authenticator code. ${recoveryCodesLeft} unused code${recoveryCodesLeft === 1 ? '' : 's'} left.`,
        meta: { recoveryCodesLeft },
      });
    }

    const response = NextResponse.json({
      success: true,
      admin: { email, name: identity.name, role: identity.role },
      mustChangePassword: restriction === 'password_change',
      twoFactorSetupRequired: restriction === 'two_factor_setup',
      restriction,
      newDevice,
      newIp,
      recoveryCodesLeft,
      sessionHours: settings.sessionHours,
      idleTimeoutMinutes: settings.idleTimeoutMinutes,
    });

    response.cookies.set(AUTH_COOKIE, token, authCookieOptions(settings.sessionHours * 3600));
    return response;
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
