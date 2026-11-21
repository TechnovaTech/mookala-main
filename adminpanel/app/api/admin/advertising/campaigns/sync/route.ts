import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { syncCampaignStatuses, syncInvoiceStatuses } from '../../_lib/campaigns';

export const dynamic = 'force-dynamic';

/**
 * Brings stored statuses in line with dates: approved campaigns whose start
 * date has arrived become live, campaigns past their end date become
 * completed, and unpaid invoices past their due date become overdue.
 *
 * GET runs when an advertising screen is opened (a read). Changes it makes are
 * logged as automatic, with no admin named. POST is the "Update statuses"
 * button and is logged against the admin who pressed it.
 */
async function run(request: NextRequest, byAdmin: boolean) {
  const check = await requireAdmin(request, byAdmin ? 'ads:manage' : 'ads:view');
  if (!check.ok) return check.response;
  try {
    const { db } = await connectToDatabase();
    const context = byAdmin
      ? { admin: check.admin, request, trigger: 'Update statuses button' }
      : { admin: null, request, trigger: 'advertising screen opened' };
    const changes = [...(await syncCampaignStatuses(db, context)), ...(await syncInvoiceStatuses(db, context))];
    return ok({ changed: changes.length, changes, checkedAt: new Date() });
  } catch (error) {
    console.error('Campaign status update failed:', error);
    return fail('Failed to update the statuses', 500);
  }
}

export async function GET(request: NextRequest) {
  return run(request, false);
}

export async function POST(request: NextRequest) {
  return run(request, true);
}
