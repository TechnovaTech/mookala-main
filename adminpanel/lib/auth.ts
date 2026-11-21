import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from './mongodb';
import { getJwtSecret } from './jwt-edge';
import { can, normaliseRole, type AdminIdentity } from './permissions';
import {
  getSecuritySettings,
  ipAllowedFor,
  normaliseIp,
  recordSecurityEvent,
  twoFactorRequiredFor,
  type SecuritySettings,
} from './security-settings';

/** Default session length. The value in force is `sessionHours` in the security settings. */
export const SESSION_HOURS = 12;
export const AUTH_COOKIE = 'auth-token';

export interface AdminTokenPayload extends AdminIdentity {
  [key: string]: any;
}

export function signAdminToken(payload: AdminIdentity & Record<string, any>, hours: number = SESSION_HOURS): string {
  const secret = getJwtSecret();
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.sign(payload, secret, { expiresIn: `${hours}h`, algorithm: 'HS256' });
}

/**
 * Signs the same session again with changed claims, keeping its original
 * expiry. Used when a restriction carried in the token (`lim`) is lifted.
 */
export function resignAdminToken(current: AdminTokenPayload, changes: Record<string, any>): { token: string; maxAge: number } {
  const secret = getJwtSecret();
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const { iat, exp, nbf, ...claims } = current;
  const next: Record<string, any> = { ...claims, ...changes };
  for (const key of Object.keys(next)) if (next[key] === undefined || next[key] === null) delete next[key];
  const expiry = typeof exp === 'number' ? exp : Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
  return {
    token: jwt.sign({ ...next, exp: expiry }, secret, { algorithm: 'HS256' }),
    maxAge: Math.max(1, expiry - Math.floor(Date.now() / 1000)),
  };
}

/** Cookie settings for the admin session: not readable by scripts, same-site, HTTPS-only in production. */
export function authCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function verifyToken(token: string) {
  const secret = getJwtSecret();
  if (!secret) return null;
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest) {
  return (
    request.cookies.get(AUTH_COOKIE)?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '')
  );
}

/**
 * Returns the signed-in admin for the request, or null when the request has no
 * valid admin session. This only checks the token; use `requireAdmin` when the
 * session must also be live in the database.
 */
export function getAdminFromRequest(request: NextRequest): AdminTokenPayload | null {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || typeof payload === 'string') return null;

  // Tokens issued to app users are signed with the same secret. Only a token
  // that carries an admin role, and is not an app token, is an admin session.
  const candidate = payload as AdminTokenPayload;
  if (candidate.typ === 'app' || !normaliseRole(candidate.role)) return null;

  return candidate;
}

/**
 * The caller's address: the first X-Forwarded-For entry, else X-Real-IP.
 * An IPv4 address written as IPv6 ("::ffff:203.0.113.7") is given in its
 * IPv4 form, the form the IP allow-list and the sign-in history use.
 *
 * This trusts the first X-Forwarded-For entry, which is right only where the
 * hosting platform sets that header itself (as Vercel does). Behind a proxy
 * that appends to a header sent by the browser, a caller could choose the
 * address the IP allow-list sees.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return normaliseIp(forwarded.split(',')[0].trim());
  return normaliseIp(request.headers.get('x-real-ip') || '') || 'unknown';
}

export function newSessionId(): string {
  return crypto.randomBytes(18).toString('hex');
}

export type AdminCheck =
  | { ok: true; admin: AdminTokenPayload }
  | { ok: false; response: NextResponse };

function refuse(status: number, error: string, extra: Record<string, any> = {}): AdminCheck {
  return { ok: false, response: NextResponse.json({ success: false, error, ...extra }, { status }) };
}

/**
 * What an admin who still has to change a temporary password, or to turn on
 * required 2FA, may call: their own account, password, 2FA and sign-out, and
 * the read-only lists the My Account screen shows.
 */
function isSelfServiceRequest(request: NextRequest): boolean {
  const path = request.nextUrl.pathname;
  if (/^\/api\/auth\/(me|change-password|2fa|logout)$/.test(path)) return true;
  if (request.method === 'GET' && /^\/api\/admin\/security\/(sessions|logins)$/.test(path)) {
    return request.nextUrl.searchParams.get('mine') === '1';
  }
  // The header bell on My Account. The route answers an empty list while the account is restricted.
  if (request.method === 'GET' && path === '/api/admin/alerts') return true;
  return false;
}

export type AccountRestriction = 'password_change' | 'two_factor_setup' | null;

/** Why an account may not use the panel yet, or null when it may. */
export function accountRestriction(
  account: Record<string, any> | null | undefined,
  role: string | null | undefined,
  settings: SecuritySettings
): AccountRestriction {
  if (account?.mustChangePassword) return 'password_change';
  if (twoFactorRequiredFor(settings, role) && !account?.twoFactorEnabled) return 'two_factor_setup';
  return null;
}

export const RESTRICTION_MESSAGES: Record<Exclude<AccountRestriction, null>, string> = {
  password_change: 'You are signed in with a temporary password. Choose your own password under My Account before doing anything else.',
  two_factor_setup: 'Two-factor authentication is required for your role. Turn it on under My Account before doing anything else.',
};

/**
 * Server-side permission check for route handlers. Confirms, in this order:
 * the token; the permission; that the session exists, has not been ended, has
 * not expired and has not been idle for longer than the idle timeout; that the
 * account is still active; that the request comes from an allowed address
 * when the IP rule applies to the admin's role; and that the admin is not
 * still required to change a temporary password or to turn on 2FA.
 * Returns a ready 401/403 response when any of those fail.
 */
export async function requireAdmin(request: NextRequest, permission?: string): Promise<AdminCheck> {
  const admin = getAdminFromRequest(request);

  if (!admin) return refuse(401, 'Unauthorized. Please sign in to the admin panel again.');
  if (permission && !can(admin, permission)) return refuse(403, 'You do not have permission to do this.');

  // Every admin token is tied to a session record and an account. A token
  // without them cannot be ended, so it is not accepted.
  if (!admin.sid || !admin.id || !ObjectId.isValid(admin.id)) {
    return refuse(401, 'This session is not valid. Please sign in again.');
  }

  try {
    const { db } = await connectToDatabase();
    const sessions = db.collection('adminSessions');
    const [session, account, settings] = await Promise.all([
      sessions.findOne({ sid: admin.sid }),
      db
        .collection('admins')
        .findOne({ _id: new ObjectId(admin.id) }, { projection: { status: 1, twoFactorEnabled: 1, mustChangePassword: 1 } }),
      getSecuritySettings(db),
    ]);

    if (!session || session.revokedAt || String(session.adminId) !== admin.id) {
      return refuse(401, 'This session has ended. Please sign in again.');
    }

    const now = Date.now();
    if (session.expiresAt && new Date(session.expiresAt).getTime() <= now) {
      return refuse(401, 'This session has expired. Please sign in again.');
    }

    const lastSeen = session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : 0;
    if (now - lastSeen > settings.idleTimeoutMinutes * 60_000) {
      await sessions.updateOne(
        { sid: admin.sid, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: 'idle_timeout', revokedBy: 'system' } }
      );
      return refuse(401, `You were signed out after ${settings.idleTimeoutMinutes} minutes without activity. Please sign in again.`, {
        code: 'idle_timeout',
      });
    }

    if (!account || account.status === 'disabled') return refuse(401, 'This admin account is disabled.');

    const ip = clientIp(request);
    if (!ipAllowedFor(settings, admin.role, ip)) {
      const ended = await sessions.updateOne(
        { sid: admin.sid, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: 'ip_not_allowed', revokedBy: 'system' } }
      );
      if (ended.modifiedCount) {
        await recordSecurityEvent(db, {
          type: 'session_ip_refused',
          adminId: admin.id,
          adminEmail: admin.email,
          adminName: admin.name,
          ip,
          userAgent: request.headers.get('user-agent'),
          detail: `A signed-in session was ended because its address ${ip} is not on the IP allow-list.`,
          meta: { path: request.nextUrl.pathname },
        });
      }
      return refuse(401, `This session was ended: the admin panel cannot be used from your network address (${ip}).`, {
        code: 'ip_not_allowed',
      });
    }

    const restriction = accountRestriction(account, admin.role, settings);
    if (restriction && !isSelfServiceRequest(request)) {
      return refuse(403, RESTRICTION_MESSAGES[restriction], { code: restriction, redirect: '/security/account' });
    }

    // Record activity at most once a minute to avoid a write on every request.
    if (now - lastSeen > 60_000) {
      await sessions.updateOne({ sid: admin.sid }, { $set: { lastSeenAt: new Date() } });
    }
  } catch (error) {
    console.error('Admin session check failed:', error);
    return refuse(500, 'Could not verify the admin session.');
  }

  return { ok: true, admin };
}

/**
 * Whether the caller presents an admin token with the permission. Never throws.
 * This looks at the token only: it cannot see that a session was ended, went
 * idle or that the account was disabled. Use `requireAdmin` for anything that
 * returns private data or changes a record.
 */
export function isAdminWith(request: NextRequest, permission: string): boolean {
  const admin = getAdminFromRequest(request);
  return Boolean(admin && can(admin, permission));
}

export function roleOf(admin: AdminIdentity | null) {
  return normaliseRole(admin?.role);
}
