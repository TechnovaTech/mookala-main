import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { testGatewayConnection } from '@/lib/health';

export const dynamic = 'force-dynamic';

/** Checks the saved Razorpay keys with Razorpay. Runs only when an admin presses "Test connection". */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'system:manage');
  if (!check.ok) return check.response;

  try {
    const result = await testGatewayConnection();
    await logAudit({
      admin: check.admin,
      action: 'test_connection',
      module: 'system',
      entityType: 'payment-gateway',
      entityLabel: 'Razorpay',
      meta: { status: result.status, mode: result.mode },
      request,
    });
    return ok(result);
  } catch (error) {
    console.error('Gateway connection test failed:', error);
    return fail('The connection test could not be run', 500);
  }
}
