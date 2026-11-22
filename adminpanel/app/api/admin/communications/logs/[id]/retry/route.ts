import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { LOG_COLLECTION, retryDelivery } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/** Manual retry of one failed or unsent message. The new attempt is a new log entry with the next attempt number. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'communications:manage');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid log entry id');

  try {
    const { db } = await connectToDatabase();
    const body = await request.json().catch(() => ({}));
    const before = await db.collection(LOG_COLLECTION).findOne({ _id: oid }, { projection: { status: 1, attempt: 1, channel: 1, to: 1, templateKey: 1 } });
    const outcome = await retryDelivery(db, params.id, check.admin.email || null);
    if (!outcome.ok) return fail(outcome.error, outcome.status);

    await logAudit({
      admin: check.admin,
      action: 'retry',
      module: 'communications',
      entityType: 'notification-logs',
      entityId: params.id,
      entityLabel: before ? `${before.channel} to ${before.channel === 'push' ? 'a device' : before.to} (${before.templateKey || 'no template'})` : null,
      before: before ? { status: before.status, attempt: before.attempt || 1 } : null,
      after: { status: outcome.result.status, attempt: (before?.attempt || 1) + 1, error: outcome.result.error, newLogId: outcome.result.logId },
      reason: asString(body?.reason, 500) || null,
      request,
    });

    return ok({ status: outcome.result.status, error: outcome.result.error, logId: outcome.result.logId });
  } catch (error) {
    console.error('Retry delivery failed:', error);
    return fail('Failed to retry the message', 500);
  }
}
