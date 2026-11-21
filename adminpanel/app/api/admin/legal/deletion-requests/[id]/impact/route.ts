import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok, toObjectId } from '@/lib/http';
import { deletionImpact } from '@/lib/resources/legal.hooks';

export const dynamic = 'force-dynamic';

/**
 * Shows which records hold this person's data. Read-only: this endpoint and
 * the admin panel delete nothing. The admin acts on the records by hand and
 * records what was done.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'legal:view');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid request id');

  try {
    const { db } = await connectToDatabase();
    const item = await db.collection('deletionRequests').findOne({ _id: oid });
    if (!item) return fail('Deletion request not found', 404);

    const impact = await deletionImpact(db, item.requesterPhone);
    return ok({
      request: {
        id: String(item._id),
        requesterName: item.requesterName,
        requesterPhone: item.requesterPhone,
        accountType: item.accountType,
        status: item.status,
        legalHold: item.legalHold === true,
        scope: item.scope || '',
        outcome: item.outcome || '',
        outcomeRecordedAt: item.outcomeRecordedAt || null,
        outcomeRecordedBy: item.outcomeRecordedBy || null,
      },
      ...impact,
      canManage: can(check.admin, 'legal:manage'),
    });
  } catch (error) {
    console.error('Deletion impact failed:', error);
    return fail('Failed to work out the affected records', 500);
  }
}
