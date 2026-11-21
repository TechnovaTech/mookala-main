import { NextRequest } from 'next/server';
import { earningsResponse } from '@/lib/earnings';

export const dynamic = 'force-dynamic';

/** GET /api/artist/earnings?phone=  (the signed-in artist's own earnings and payouts) */
export async function GET(request: NextRequest) {
  return earningsResponse(request, 'artist');
}
