import { NextResponse } from 'next/server';
import { pingDatabase } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe for uptime monitors. Open to anyone, so it says only whether
 * the application can reach its database and nothing else.
 */
export async function GET() {
  const { ok } = await pingDatabase();
  return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
