import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { runDueSchedules } from '@/lib/report-files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The scheduler for report schedules. Called once an hour by the host's cron
 * (see vercel.json), which sends `Authorization: Bearer <CRON_SECRET>`.
 *
 * This route is open at the middleware (there is no admin session on a cron
 * call), so the secret is the only thing protecting it: without the exact
 * secret the answer is 401 and nothing runs.
 */
function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 16) {
    console.error('CRON_SECRET is not set (or is shorter than 16 characters): the report scheduler refuses every call.');
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
    const summary = await runDueSchedules(db);
    return ok({ ...summary });
  } catch (error) {
    console.error('Report scheduler failed:', error);
    return fail('The report scheduler failed.', 500);
  }
}
