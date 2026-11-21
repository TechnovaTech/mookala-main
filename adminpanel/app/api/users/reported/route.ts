import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { ok, fail } from '@/lib/http';
import { accountStatusOf } from '@/lib/user-status';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

const UNRESOLVED = ['open', 'under_review', 'escalated'];
const COLLECTION_OF: Record<string, string> = { user: 'users', artist: 'artists', organizer: 'organizers' };
const ACCOUNT_LIMIT = 100;

/**
 * GET /api/users/reported
 * Accounts with at least one report that is still open, under review or
 * escalated, each matched by phone number to the real account so the admin can
 * open it and restrict it. Reads `userReports` (written by Reported Accounts).
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'users:view');
  if (!check.ok) return check.response;
  if (!can(check.admin, 'support:view')) return fail('You do not have permission to read reports.', 403);

  try {
    const { db } = await connectToDatabase();
    const groups = await db
      .collection('userReports')
      .aggregate([
        { $match: { status: { $in: UNRESOLVED }, reportedPhone: { $type: 'string', $ne: '' } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: { phone: '$reportedPhone', type: '$reportedType' },
            name: { $first: '$reportedName' },
            unresolved: { $sum: 1 },
            reasons: { $addToSet: '$reason' },
            latestAt: { $max: '$createdAt' },
          },
        },
        { $sort: { unresolved: -1, latestAt: -1 } },
        { $limit: ACCOUNT_LIMIT },
      ])
      .toArray();

    const withoutPhone = await db
      .collection('userReports')
      .countDocuments({ status: { $in: UNRESOLVED }, $or: [{ reportedPhone: { $exists: false } }, { reportedPhone: '' }, { reportedPhone: null }] });

    const accounts = new Map<string, any>();
    const totals = new Map<string, number>();
    await Promise.all(
      Object.entries(COLLECTION_OF).map(async ([type, collection]) => {
        const phones = groups.filter((group) => group._id.type === type).map((group) => group._id.phone);
        if (phones.length === 0) return;
        const [docs, counts] = await Promise.all([
          db
            .collection(collection)
            .find({ phone: { $in: phones } }, { projection: { phone: 1, name: 1, accountStatus: 1, isActive: 1, accountStatusReason: 1 } })
            .toArray(),
          db
            .collection('userReports')
            .aggregate([{ $match: { reportedType: type, reportedPhone: { $in: phones } } }, { $group: { _id: '$reportedPhone', count: { $sum: 1 } } }])
            .toArray(),
        ]);
        for (const doc of docs) accounts.set(`${type}|${doc.phone}`, doc);
        for (const row of counts) totals.set(`${type}|${row._id}`, row.count);
      })
    );

    return ok({
      canRestrictUsers: can(check.admin, 'users:manage'),
      withoutPhone,
      accounts: groups.map((group) => {
        const key = `${group._id.type}|${group._id.phone}`;
        const account = accounts.get(key);
        return {
          phone: group._id.phone,
          type: group._id.type || '',
          reportedName: group.name || '',
          unresolved: group.unresolved,
          totalReports: totals.get(key) ?? group.unresolved,
          reasons: (group.reasons || []).filter(Boolean),
          latestAt: group.latestAt || null,
          account: account
            ? {
                id: String(account._id),
                name: account.name || '',
                accountStatus: accountStatusOf(account),
                accountStatusReason: account.accountStatusReason || null,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error('Reported accounts error:', error);
    return fail('Failed to load reported accounts', 500);
  }
}
