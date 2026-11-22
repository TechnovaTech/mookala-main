import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { RESTRICT_MODES, canRestrict, findReportedAccount, isReportedType } from '../_accounts';

export const dynamic = 'force-dynamic';

const UNRESOLVED = ['open', 'under_review', 'escalated'];
const LIMIT = 100;

/**
 * GET /api/admin/support/reports/accounts   (support:view)
 * Every account with at least one unresolved report (open, under review or
 * escalated), matched to the real user, artist or organiser by phone, with the
 * latest unresolved report (the one a restriction from this panel is recorded on).
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'support:view');
  if (!check.ok) return check.response;

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
            latestReportId: { $first: '$_id' },
            unresolved: { $sum: 1 },
            reasons: { $addToSet: '$reason' },
            latestAt: { $max: '$createdAt' },
          },
        },
        { $sort: { unresolved: -1, latestAt: -1 } },
        { $limit: LIMIT },
      ])
      .toArray();
    const withoutPhone = await db.collection('userReports').countDocuments({
      status: { $in: UNRESOLVED },
      $or: [{ reportedPhone: { $exists: false } }, { reportedPhone: '' }, { reportedPhone: null }],
    });

    const accounts = await Promise.all(
      groups.map(async (group) => {
        const type = group._id.type;
        const account = isReportedType(type) ? await findReportedAccount(db, type, group._id.phone) : null;
        const total = await db.collection('userReports').countDocuments({ reportedType: type, reportedPhone: group._id.phone });
        return {
          phone: group._id.phone,
          type: type || '',
          reportedName: group.name || '',
          latestReportId: String(group.latestReportId),
          unresolved: group.unresolved,
          totalReports: total,
          reasons: (group.reasons || []).filter(Boolean),
          latestAt: group.latestAt || null,
          account,
          modes: isReportedType(type) ? RESTRICT_MODES[type] : [],
          canRestrict: isReportedType(type) ? canRestrict(check.admin, type) : false,
        };
      })
    );
    return ok({ accounts, withoutPhone });
  } catch (error) {
    console.error('Reported accounts failed:', error);
    return fail('Failed to load reported accounts', 500);
  }
}
