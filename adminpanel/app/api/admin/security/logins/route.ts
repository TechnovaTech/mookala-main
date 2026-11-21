import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { clientIp, requireAdmin } from '@/lib/auth';
import { recordSecurityEvent } from '@/lib/security-settings';
import { can } from '@/lib/permissions';
import { ok, fail, asString, escapeRegex, toCsv, csvResponse } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { describeDevice } from '@/components/security/device';
import { CREDENTIAL_FAILURES, LOCK_MAX_FAILURES, LOCK_MINUTES, dateRangeFilter, isSuperAdmin, pageParams, readBody } from '../_shared';

export const dynamic = 'force-dynamic';

const REASONS: Record<string, string> = {
  ok: 'Signed in',
  unknown_account: 'No admin account with this email',
  wrong_password: 'Wrong password',
  disabled_account: 'Account is disabled',
  no_role: 'Account has no role',
  wrong_2fa_code: 'Wrong two-factor code',
  wrong_recovery_code: 'Wrong or used recovery code',
  locked: 'Refused: too many failed attempts',
  ip_not_allowed: 'Refused: network address not on the IP allow-list',
};

/**
 * Admin sign-in history.
 *
 *   GET ?email=&result=success|failure&from=&to=&page=&limit=&format=csv
 *   GET ?mine=1          the caller's own recent sign-ins (any signed-in admin)
 *   POST { action: 'unlock', email, reason }   Super Admin only
 *
 * A sign-in attempt is a failure unless `success` is exactly true. Attempts
 * cleared by an unlock keep their reason and time and are marked
 * `lockCleared`, so the history stays complete.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mine = params.get('mine') === '1';

  const check = await requireAdmin(request, mine ? undefined : 'security:view');
  if (!check.ok) return check.response;
  const { admin } = check;

  const filter: Record<string, any> = {};
  if (mine) {
    filter.email = admin.email || '__none__';
  } else {
    const email = asString(params.get('email'), 200).toLowerCase();
    if (email) filter.email = { $regex: escapeRegex(email), $options: 'i' };
  }

  const result = params.get('result');
  if (result === 'success') filter.success = true;
  else if (result === 'failure') filter.success = { $ne: true };
  else if (result) return fail('Unknown result filter. Use success or failure.');

  const range = dateRangeFilter(params.get('from'), params.get('to'));
  if (range.error) return fail(range.error);
  if (range.filter) filter.createdAt = range.filter;

  const { db } = await connectToDatabase();
  const history = db.collection('adminLoginHistory');

  const shape = (row: any) => ({
    id: String(row._id),
    email: row.email || '',
    success: row.success === true,
    reason: row.reason || '',
    reasonLabel: REASONS[row.reason] || row.reason || '',
    ip: row.ip || 'unknown',
    device: describeDevice(row.userAgent),
    userAgent: row.userAgent || '',
    newDevice: Boolean(row.newDevice),
    lockCleared: Boolean(row.lockCleared),
    createdAt: row.createdAt,
  });

  if (params.get('format') === 'csv') {
    if (mine) return fail('The export is available from Login History.', 400);
    const rows = await history.find(filter).sort({ createdAt: -1 }).limit(10000).toArray();
    await logAudit({
      admin,
      action: 'export',
      module: 'security',
      entityType: 'adminLoginHistory',
      meta: { rows: rows.length, filters: Object.fromEntries(params.entries()) },
      request,
    });
    const csv = toCsv(
      rows.map((row) => {
        const item = shape(row);
        return {
          ...item,
          result: item.success ? 'Success' : 'Failure',
          newDevice: item.newDevice ? 'Yes' : '',
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
        };
      }),
      [
        { key: 'createdAt', label: 'Time (UTC)' },
        { key: 'email', label: 'Email' },
        { key: 'result', label: 'Result' },
        { key: 'reasonLabel', label: 'Reason' },
        { key: 'ip', label: 'IP address' },
        { key: 'device', label: 'Device' },
        { key: 'newDevice', label: 'New device or location' },
        { key: 'userAgent', label: 'User agent' },
      ]
    );
    return csvResponse(csv, `admin-login-history-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const { page, limit, skip } = pageParams(params, mine ? 10 : 25);
  const [rows, total] = await Promise.all([
    history.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    history.countDocuments(filter),
  ]);

  if (mine) return ok({ logins: rows.map(shape), total, page, limit });

  const now = Date.now();
  const [failed24h, failedAccounts24h, lockRows] = await Promise.all([
    history.countDocuments({ success: { $ne: true }, createdAt: { $gte: new Date(now - 86_400_000) } }),
    history.distinct('email', { success: { $ne: true }, createdAt: { $gte: new Date(now - 86_400_000) } }),
    // Exactly what the sign-in route counts (lockCountFilter): wrong credentials in the last
    // 15 minutes that an unlock has not cleared.
    history
      .aggregate([
        {
          $match: {
            success: false,
            reason: { $in: CREDENTIAL_FAILURES },
            lockCleared: { $ne: true },
            createdAt: { $gte: new Date(now - LOCK_MINUTES * 60_000) },
          },
        },
        { $group: { _id: '$email', failures: { $sum: 1 }, first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
        { $match: { failures: { $gte: LOCK_MAX_FAILURES } } },
        { $sort: { last: -1 } },
      ])
      .toArray(),
  ]);

  return ok({
    logins: rows.map(shape),
    total,
    page,
    limit,
    summary: {
      failed24h,
      failedAccounts24h: failedAccounts24h.length,
      lockRule: { failures: LOCK_MAX_FAILURES, minutes: LOCK_MINUTES },
      locked: lockRows.map((row) => ({
        email: row._id,
        failures: row.failures,
        lastFailureAt: row.last,
        // The lock lifts when the oldest counted failure leaves the window.
        unlocksAt: new Date(
          new Date(row.first).getTime() + LOCK_MINUTES * 60_000
        ),
      })),
    },
    canUnlock: isSuperAdmin(admin) && can(admin, 'security:manage'),
  });
}

/** Clears the failed attempts that are keeping an email locked out. */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'security:manage');
  if (!check.ok) return check.response;
  if (!isSuperAdmin(check.admin)) return fail('Only a Super Admin can unlock an account.', 403);

  const body = await readBody(request);
  if (asString(body.action, 20) !== 'unlock') return fail('Unknown action.');
  const email = asString(body.email, 200).toLowerCase();
  const reason = asString(body.reason, 500);
  if (!email) return fail('Email is required.');
  if (!reason) return fail('A reason is required. It is saved in the activity log.');

  const { db } = await connectToDatabase();
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);

  // The sign-in route counts rows with `success: false`. The rows are kept for
  // the history, but taken out of that count and marked as cleared.
  const result = await db.collection('adminLoginHistory').updateMany(
    { email, success: false, reason: { $in: CREDENTIAL_FAILURES }, lockCleared: { $ne: true }, createdAt: { $gte: since } },
    { $set: { lockCleared: true, lockClearedAt: new Date(), lockClearedBy: check.admin.email || null } }
  );

  if (result.modifiedCount === 0) return fail('This email has no failed attempts counting towards a lock.', 404);

  await logAudit({
    admin: check.admin,
    action: 'unlock',
    module: 'security',
    entityType: 'adminLogin',
    entityLabel: email,
    before: { countedFailures: result.modifiedCount },
    after: { countedFailures: 0 },
    reason,
    request,
  });
  const account = await db.collection('admins').findOne({ email }, { projection: { name: 1 } });
  await recordSecurityEvent(db, {
    type: 'account_unlocked',
    adminId: account ? String(account._id) : null,
    adminEmail: email,
    adminName: account?.name || null,
    actorEmail: check.admin.email || null,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent'),
    detail: `Sign-in lock cleared by ${check.admin.email || 'a Super Admin'}: ${result.modifiedCount} failed attempt${result.modifiedCount === 1 ? '' : 's'} no longer count. Reason: ${reason}`,
  });

  return ok({ message: `${email} can sign in again. ${result.modifiedCount} failed attempt${result.modifiedCount === 1 ? '' : 's'} cleared from the lock count.`, cleared: result.modifiedCount });
}
