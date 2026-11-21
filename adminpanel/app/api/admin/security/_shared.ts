import crypto from 'crypto';
import type { Db } from 'mongodb';
import { MODULES, normaliseRole, type AdminIdentity } from '@/lib/permissions';
import { passwordProblem } from '@/lib/password';

/** Server-only helpers shared by the Security & Audit API routes. */

/**
 * The JSON body as an object. A missing or unreadable body, and a body that is
 * `null`, a list or a single value, all give {} so a handler can never fail
 * on reading a field of it.
 */
export async function readBody(request: Request): Promise<Record<string, any>> {
  const raw = await request.json().catch(() => null);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

export const LOCK_MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
/** Failures after which "repeated failed sign-ins" is raised as a security event. */
export const WARN_FAILURES = 3;

/**
 * Only a wrong credential counts towards a lock. A sign-in refused for another
 * reason (locked, disabled, IP rule) is recorded in the history but does not
 * extend the lock, so nobody can keep an account locked by retrying.
 */
export const CREDENTIAL_FAILURES = ['unknown_account', 'wrong_password', 'wrong_2fa_code', 'wrong_recovery_code'];

/** The failed attempts that count towards a lock right now, for one email or for all. */
export function lockCountFilter(email?: string): Record<string, any> {
  const filter: Record<string, any> = {
    success: false,
    reason: { $in: CREDENTIAL_FAILURES },
    lockCleared: { $ne: true },
    createdAt: { $gte: new Date(Date.now() - LOCK_MINUTES * 60_000) },
  };
  if (email) filter.email = email;
  return filter;
}

export function isSuperAdmin(admin: AdminIdentity | null | undefined): boolean {
  return normaliseRole(admin?.role) === 'super_admin';
}

/** Accounts created before roles existed are stored as "admin" and are Super Admins. */
export const SUPER_ROLE_VALUES = ['super_admin', 'admin'];

export function isValidPermission(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const [module, action, extra] = value.split(':');
  return extra === undefined && (MODULES as readonly string[]).includes(module) && ['view', 'manage', 'approve'].includes(action);
}

/**
 * A random temporary password that satisfies the password rules. It is shown
 * to the Super Admin once and only its bcrypt hash is stored.
 */
export function generateTemporaryPassword(): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '#@%+=?';
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(set.length)];

  for (;;) {
    const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
    while (chars.length < 16) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const password = chars.join('');
    if (!passwordProblem(password)) return password;
  }
}

/** Ends every live session of an admin. Returns how many were ended. */
export async function revokeSessionsOf(db: Db, adminId: string, why: string, by: string, exceptSid?: string) {
  const filter: Record<string, any> = { adminId, revokedAt: null };
  if (exceptSid) filter.sid = { $ne: exceptSid };
  const result = await db
    .collection('adminSessions')
    .updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: why, revokedBy: by } });
  return result.modifiedCount;
}

/** Parses "YYYY-MM-DD" as an India Standard Time day. `endOfDay` returns the start of the next day. */
export function parseIstDay(value: string | null, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  // Date.UTC rolls 2026-13-01 over to January 2027: refuse a day that does not exist.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const start = Date.UTC(year, month - 1, day) - 330 * 60_000;
  if (Number.isNaN(start)) return null;
  return new Date(start + (endOfDay ? 86_400_000 : 0));
}

/** Builds a createdAt filter from optional from/to day strings, or null when neither is given. */
export function dateRangeFilter(from: string | null, to: string | null): { filter: Record<string, Date> | null; error?: string } {
  const filter: Record<string, Date> = {};
  if (from) {
    const start = parseIstDay(from);
    if (!start) return { filter: null, error: 'The start date is not valid (use YYYY-MM-DD).' };
    filter.$gte = start;
  }
  if (to) {
    const end = parseIstDay(to, true);
    if (!end) return { filter: null, error: 'The end date is not valid (use YYYY-MM-DD).' };
    filter.$lt = end;
  }
  if (filter.$gte && filter.$lt && filter.$gte.getTime() >= filter.$lt.getTime()) {
    return { filter: null, error: 'The start date must not be after the end date.' };
  }
  return { filter: Object.keys(filter).length ? filter : null };
}

export function pageParams(params: URLSearchParams, defaultLimit = 25, maxLimit = 100) {
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(params.get('limit') || String(defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/** What the Admins & Roles screen may know about an account. Never the password hash or 2FA secret. */
export function publicAdmin(doc: any, selfId?: string) {
  return {
    id: String(doc._id),
    name: doc.name || '',
    email: doc.email || '',
    phone: doc.phone || '',
    role: normaliseRole(doc.role),
    storedRole: doc.role || null,
    extraPermissions: Array.isArray(doc.extraPermissions) ? doc.extraPermissions : [],
    status: doc.status === 'disabled' ? 'disabled' : 'active',
    twoFactorEnabled: Boolean(doc.twoFactorEnabled),
    mustChangePassword: Boolean(doc.mustChangePassword),
    lastLoginAt: doc.lastLoginAt || null,
    lastLoginIp: doc.lastLoginIp || null,
    createdAt: doc.createdAt || null,
    isSelf: selfId ? String(doc._id) === selfId : false,
  };
}
