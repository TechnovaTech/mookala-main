import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { runNotificationScheduler } from '@/app/api/admin/communications/_lib/scheduler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The notification scheduler (see app/api/admin/communications/_lib/scheduler.ts).
 * Called every 15 minutes by the host's cron (vercel.json), which sends
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * Vercel Hobby plan: crons run at most once a day there and a 15-minute
 * schedule is refused at deployment; use the Pro plan or call this URL from
 * an external scheduler with the same header.
 *
 * Open at the middleware (there is no admin session on a cron call), so the
 * secret is the only protection: without the exact secret the answer is 401
 * and nothing runs. A secret that is unset or shorter than 16 characters
 * refuses every call.
 */
function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 16) {
    console.error('CRON_SECRET is not set (or is shorter than 16 characters): the notification scheduler refuses every call.');
    return false;
  }
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  // Compared as fixed-length digests so the comparison takes the same time whatever was sent.
  const given = crypto.createHash('sha256').update(header.slice(7)).digest();
  const expected = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return fail('Unauthorized.', 401);

  try {
    const { db } = await connectToDatabase();
    const run = await runNotificationScheduler(db, { trigger: 'cron', by: 'cron' });
    return ok({ runId: run.runId, startedAt: run.startedAt, finishedAt: run.finishedAt, ...run.result });
  } catch (error) {
    console.error('Notification scheduler failed:', error);
    return fail('The notification scheduler failed.', 500);
  }
}
