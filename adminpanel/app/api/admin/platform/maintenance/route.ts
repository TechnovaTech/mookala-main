import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { getPlatformConfig, maintenanceStatus } from '@/lib/platform-config';
import { noticesForWindows } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

/**
 * The maintenance state for the banner every admin sees inside the admin
 * panel: whether maintenance is on now, and the next scheduled window with
 * the state of its advance notice. Any signed-in admin may read it.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request);
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const status = maintenanceStatus(await getPlatformConfig(db));
    const next = status.nextWindow;
    const notice = next ? (await noticesForWindows(db, [next.id]))[next.id]?.[0] || null : null;

    return ok({
      active: status.active,
      source: status.source,
      message: status.message,
      endsAt: status.endsAt,
      nextWindow: next,
      nextNotice: notice ? { status: notice.status, scheduledFor: notice.scheduledFor || null } : null,
    });
  } catch (error) {
    console.error('Maintenance state failed:', error);
    return fail('The maintenance state could not be read', 500);
  }
}
