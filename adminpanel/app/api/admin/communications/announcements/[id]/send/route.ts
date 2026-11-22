import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, toObjectId } from '@/lib/http';
import { runAnnouncementBatch } from '../../../_lib/announcements';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * "Send now": sends the next batch of an approved announcement (see
 * _lib/announcements.ts). Every message is written to the delivery log.
 *
 * The announcement becomes "sent" only when every recipient was processed and
 * a provider accepted at least one message; "failed" when none was accepted;
 * "sending" while recipients are left (the scheduler continues it).
 * Emergency announcements are sent even when a later time is scheduled.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'communications:manage');
  if (!check.ok) return check.response;

  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid announcement id');

  try {
    const { db } = await connectToDatabase();
    const result = await runAnnouncementBatch(db, oid, {
      actor: check.admin,
      trigger: 'manual',
      request,
      // Leave room inside the host's 60-second limit to save the results.
      deadline: Date.now() + 45_000,
    });
    if (!result.ok) return fail(result.error, result.status);
    const outcome = result.outcome;
    return ok({
      sent: outcome.status === 'sent',
      status: outcome.status,
      reason: outcome.reason,
      audience: outcome.audience,
      processedThisRun: outcome.processedThisRun,
      remaining: outcome.remaining,
      thisRun: outcome.thisRun,
      totals: outcome.totals,
      stoppedAtDeadline: outcome.stoppedAtDeadline,
    });
  } catch (error) {
    console.error('Announcement send failed:', error);
    return fail('Failed to send the announcement', 500);
  }
}
