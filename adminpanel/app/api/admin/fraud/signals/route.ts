import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok } from '@/lib/http';
import { runRiskChecks } from '@/lib/risk';
import { logServerError } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * Runs the risk detectors now and returns their signals. Read-only: running
 * the checks never changes an account, a booking or a payment.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'fraud:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const run = await runRiskChecks(db);
    return ok({ ...run, canManage: can(check.admin, 'fraud:manage') });
  } catch (error) {
    console.error('Risk checks failed:', error);
    await logServerError('fraud.signals', error, request.nextUrl.pathname);
    return fail('The risk checks could not be run', 500);
  }
}
