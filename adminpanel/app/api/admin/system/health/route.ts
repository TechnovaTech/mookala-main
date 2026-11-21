import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok } from '@/lib/http';
import { getSystemHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

/** { overall: 'ok' | 'degraded' | 'down', checkedAt, checks: [...] } for the status page and the dashboard. */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'system:view');
  if (!check.ok) return check.response;

  try {
    const report = await getSystemHealth();
    return ok({ ...report, canManage: can(check.admin, 'system:manage') });
  } catch (error) {
    console.error('Health report failed:', error);
    return fail('The health checks could not be run', 500);
  }
}
