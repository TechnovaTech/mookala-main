import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok, toObjectId } from '@/lib/http';
import { LOG_COLLECTION } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const CHAIN_FIELDS = { status: 1, attempt: 1, createdAt: 1, error: 1, retryLogId: 1, retryOf: 1, retryMode: 1, requestedBy: 1, providerMessageId: 1 };

/** One delivery log entry with its full event history and every attempt of the same message. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'communications:view');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid log entry id');

  try {
    const { db } = await connectToDatabase();
    const logs = db.collection(LOG_COLLECTION);
    const entry = await logs.findOne({ _id: oid }, { projection: { direct: 0 } });
    if (!entry) return fail('Log entry not found', 404);

    const root = entry.rootLogId || (entry.retryLogId ? String(entry._id) : null);
    const chain = root
      ? await logs
          .find({ $or: [{ _id: toObjectId(root) as any }, { rootLogId: root }] }, { projection: CHAIN_FIELDS })
          .sort({ attempt: 1, createdAt: 1 })
          .limit(20)
          .toArray()
      : [];

    return ok({
      item: { ...entry, _id: String(entry._id) },
      attempts: chain.map((item) => ({ ...item, _id: String(item._id) })),
      canManage: can(check.admin, 'communications:manage'),
    });
  } catch (error) {
    console.error('Load delivery log entry failed:', error);
    return fail('Failed to load the log entry', 500);
  }
}
