import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { retryDelivery } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/** Manual retry of one failed or unsent message. The new attempt is a new log entry. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'communications:manage');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const outcome = await retryDelivery(db, params.id, check.admin.email || null);
    if (!outcome.ok) return fail(outcome.error, outcome.status);

    await logAudit({
      admin: check.admin,
      action: 'retry',
      module: 'communications',
      entityType: 'notification-logs',
      entityId: params.id,
      after: { status: outcome.result.status, error: outcome.result.error, newLogId: outcome.result.logId },
      request,
    });

    return ok({ status: outcome.result.status, error: outcome.result.error, logId: outcome.result.logId });
  } catch (error) {
    console.error('Retry delivery failed:', error);
    return fail('Failed to retry the message', 500);
  }
}
