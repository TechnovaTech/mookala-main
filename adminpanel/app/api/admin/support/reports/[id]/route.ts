import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import type { AccountStatus } from '@/lib/user-status';
import { MIN_REASON } from '@/lib/resources/support.hooks';
import {
  MANAGE_PERMISSION,
  RESTRICT_MODES,
  canRestrict,
  findReportedAccount,
  isReportedType,
  setAccountRestriction,
} from '../_accounts';

export const dynamic = 'force-dynamic';

const UNRESOLVED = ['open', 'under_review', 'escalated'];

/**
 * GET /api/admin/support/reports/[id]   (support:view)
 * The reported account behind a report (matched by type and phone), its
 * current restriction, and every restriction made from this report.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'support:view');
  if (!check.ok) return check.response;
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid report id', 400);

  try {
    const { db } = await connectToDatabase();
    const report = await db.collection('userReports').findOne({ _id: oid }, { projection: { notes: 0 } });
    if (!report) return fail('Report not found', 404);
    const type = report.reportedType;
    const account = isReportedType(type) ? await findReportedAccount(db, type, report.reportedPhone) : null;
    return ok({
      report: { _id: String(report._id), reportedType: type || '', reportedPhone: report.reportedPhone || '', reportedName: report.reportedName || '', status: report.status || '' },
      account,
      accountActions: Array.isArray(report.accountActions) ? report.accountActions : [],
      restrictable: isReportedType(type),
      modes: isReportedType(type) ? RESTRICT_MODES[type] : [],
      canRestrict: isReportedType(type) ? canRestrict(check.admin, type) : false,
      neededPermission: isReportedType(type) ? MANAGE_PERMISSION[type] : null,
      canManageReport: can(check.admin, 'support:manage'),
    });
  } catch (error) {
    console.error('Report account lookup failed:', error);
    return fail('Failed to load the report', 500);
  }
}

/**
 * POST /api/admin/support/reports/[id]
 *   { action: 'restrict', mode: 'suspended' | 'blocked', reason }
 *   { action: 'lift', reason }
 * Restricts (or lifts the restriction of) the account the report is about.
 * Needs support:manage and the account module's manage permission
 * (users:manage, artists:manage or organizers:manage). The account change is
 * written exactly as on the account's own page; the report records the action,
 * and a restriction marks an unresolved report as "Action taken".
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'support:manage');
  if (!check.ok) return check.response;
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid report id', 400);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid request body', 400);
  const action = asString(body.action, 20);
  const reason = asString(body.reason, 1000);
  if (action !== 'restrict' && action !== 'lift') return fail('Unknown action. Use restrict or lift.', 400);
  if (reason.length < MIN_REASON) return fail(`A written reason of at least ${MIN_REASON} characters is required.`, 400);

  try {
    const { db } = await connectToDatabase();
    const report = await db.collection('userReports').findOne({ _id: oid });
    if (!report) return fail('Report not found', 404);
    const type = report.reportedType;
    if (!isReportedType(type)) return fail('Advertisers have no sign-in account to restrict.', 409);
    if (!can(check.admin, MANAGE_PERMISSION[type])) return fail('You do not have permission to restrict this kind of account.', 403);

    const account = await findReportedAccount(db, type, report.reportedPhone);
    if (!account) return fail('No account has the reported phone number. Correct the phone on the report first.', 409);

    let next: AccountStatus;
    if (action === 'restrict') {
      const mode = asString(body.mode, 20) as AccountStatus;
      if (!RESTRICT_MODES[type].includes(mode)) {
        return fail(type === 'user' ? 'Choose suspended or blocked.' : 'Artists and organisers can be suspended, not blocked.', 400);
      }
      next = mode;
    } else {
      if (account.accountStatus === 'active') return fail('This account is not restricted.', 409);
      next = 'active';
    }

    const changed = await setAccountRestriction({
      db,
      type,
      accountId: account.id,
      current: account.accountStatus,
      next,
      reason,
      admin: check.admin,
      request,
      reportId: params.id,
    });
    if (!changed.ok) return fail(changed.error, changed.status);

    const now = new Date();
    const entry = {
      at: now,
      by: check.admin.email || null,
      byName: check.admin.name || null,
      action,
      accountType: type,
      accountId: account.id,
      accountName: account.name,
      from: account.accountStatus,
      to: next,
      reason,
    };
    const set: Record<string, any> = {
      accountActionState: action === 'restrict' ? 'restricted' : 'lifted',
      updatedAt: now,
      updatedBy: check.admin.email || null,
    };
    const statusChanged = action === 'restrict' && UNRESOLVED.includes(report.status);
    if (statusChanged) {
      Object.assign(set, { status: 'action_taken', statusReason: reason, statusChangedAt: now, statusChangedBy: check.admin.email || null });
    }
    await db.collection('userReports').updateOne({ _id: oid }, { $set: set, $push: { accountActions: entry } as any });

    await logAudit({
      admin: check.admin,
      action: action === 'restrict' ? 'restrict_account' : 'lift_restriction',
      module: 'support',
      entityType: 'user-reports',
      entityId: params.id,
      entityLabel: report.reportedName || account.name || account.phone,
      before: { status: report.status, accountStatus: account.accountStatus },
      after: { status: statusChanged ? 'action_taken' : report.status, accountStatus: next },
      reason,
      request,
      meta: { accountType: type, accountId: account.id },
    });

    const label = type === 'user' ? 'Customer' : type === 'artist' ? 'Artist' : 'Organiser';
    return ok({
      message: action === 'restrict' ? `${label} account is now ${next}. The report is marked as action taken.` : `${label} account is active again.`,
      accountStatus: next,
      reportStatus: statusChanged ? 'action_taken' : report.status,
    });
  } catch (error) {
    console.error('Report restriction failed:', error);
    return fail('Failed to change the account', 500);
  }
}
