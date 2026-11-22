import type { Db } from 'mongodb';
import type { NextRequest } from 'next/server';
import { logAudit } from '@/lib/audit';
import { toObjectId } from '@/lib/http';
import { can, type AdminIdentity } from '@/lib/permissions';
import { accountStatusOf, type AccountStatus } from '@/lib/user-status';
import { changeAccountStatus } from '@/app/api/admin/artists/_shared';
import { phoneForms } from '@/lib/resources/support.hooks';

/** Accounts a report can be about, and what restricting each one means. Server only. */

export type ReportedType = 'user' | 'artist' | 'organizer';

export const ACCOUNT_COLLECTION: Record<ReportedType, 'users' | 'artists' | 'organizers'> = {
  user: 'users',
  artist: 'artists',
  organizer: 'organizers',
};

/** The module permission needed to restrict an account of this type (on top of support:manage). */
export const MANAGE_PERMISSION: Record<ReportedType, string> = {
  user: 'users:manage',
  artist: 'artists:manage',
  organizer: 'organizers:manage',
};

export const ACCOUNT_PATH: Record<ReportedType, string> = {
  user: '/users/',
  artist: '/artists/',
  organizer: '/organizers/',
};

/** Customers can be suspended or blocked; artists and organisers can be suspended. */
export const RESTRICT_MODES: Record<ReportedType, AccountStatus[]> = {
  user: ['suspended', 'blocked'],
  artist: ['suspended'],
  organizer: ['suspended'],
};

export function isReportedType(value: unknown): value is ReportedType {
  return value === 'user' || value === 'artist' || value === 'organizer';
}

export async function findReportedAccount(db: Db, type: ReportedType, phone: unknown) {
  if (!phone) return null;
  const doc = await db
    .collection(ACCOUNT_COLLECTION[type])
    .findOne({ phone: { $in: phoneForms(phone) } }, { projection: { name: 1, phone: 1, accountStatus: 1, isActive: 1, accountStatusReason: 1, accountStatusBy: 1, accountStatusAt: 1 } });
  if (!doc) return null;
  return {
    id: String(doc._id),
    name: doc.name || '',
    phone: doc.phone || '',
    accountStatus: accountStatusOf(doc),
    accountStatusReason: doc.accountStatusReason || null,
    accountStatusBy: doc.accountStatusBy || null,
    accountStatusAt: doc.accountStatusAt || null,
    href: ACCOUNT_PATH[type] + String(doc._id),
  };
}

export function canRestrict(admin: AdminIdentity, type: ReportedType): boolean {
  return can(admin, 'support:manage') && can(admin, MANAGE_PERMISSION[type]);
}

/**
 * Changes the account's restriction, writing the same fields and the same
 * audit entries as the account's own page does, so the account's history
 * shows the change. Returns the new status, or an error.
 */
export async function setAccountRestriction(input: {
  db: Db;
  type: ReportedType;
  accountId: string;
  current: AccountStatus;
  next: AccountStatus;
  reason: string;
  admin: AdminIdentity;
  request: NextRequest;
  reportId: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { db, type, accountId, current, next, reason, admin, request, reportId } = input;
  if (current === next) return { ok: false, error: `This account is already ${next}.`, status: 409 };

  if (type === 'user') {
    const action = next === 'active' ? 'reactivate' : next === 'blocked' ? 'block' : 'suspend';
    const now = new Date();
    const users = db.collection('users');
    const oid = toObjectId(accountId);
    const user = oid ? await users.findOne({ _id: oid }, { projection: { name: 1, phone: 1, isActive: 1, accountStatusReason: 1 } }) : null;
    if (!user) return { ok: false, error: 'The account no longer exists.', status: 404 };
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          accountStatus: next,
          isActive: next === 'active',
          accountStatusReason: reason,
          accountStatusBy: admin.email || admin.name || null,
          accountStatusAt: now,
          updatedAt: now,
        },
      }
    );
    await logAudit({
      admin,
      action,
      module: 'users',
      entityType: 'user',
      entityId: accountId,
      entityLabel: user.name || user.phone || accountId,
      before: { accountStatus: current, isActive: user.isActive ?? null, accountStatusReason: user.accountStatusReason ?? null },
      after: { accountStatus: next, isActive: next === 'active', accountStatusReason: reason },
      reason,
      request,
      meta: { fromReport: reportId },
    });
    return { ok: true };
  }

  if (next === 'blocked') return { ok: false, error: 'Artists and organisers can be suspended, not blocked.', status: 400 };
  const result = await changeAccountStatus({
    db,
    role: type,
    id: accountId,
    action: next === 'active' ? 'reactivate' : 'suspend',
    reason,
    admin,
    request,
  });
  if ('error' in result) return { ok: false, error: result.error, status: result.status };
  return { ok: true };
}
