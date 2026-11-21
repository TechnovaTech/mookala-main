import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/settings: the stored platform settings document (read-only here). */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const settings = await db.collection('settings').findOne({ type: 'platform' });
    return ok({ settings: settings || {} });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return fail('Failed to fetch settings', 500);
  }
}

/**
 * This used to save a single "platform charges" percentage that no part of the
 * system ever read. Commission, GST and gateway charges are now separate,
 * dated rules under Finance -> Commission Settings, so the old value can no
 * longer be written.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:manage');
  if (!check.ok) return check.response;
  return fail('Platform charges are no longer set here. Use Finance -> Commission Settings.', 410);
}
