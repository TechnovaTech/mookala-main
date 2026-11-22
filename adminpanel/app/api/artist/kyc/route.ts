import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail } from '@/lib/http';
import { submitKyc } from '@/lib/app-auth';
import { maintenanceBlock } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** POST /api/artist/kyc   { phone, aadharId, panId, aadharImage?, panImage? }   See submitKyc in lib/app-auth.ts. */
export async function POST(request: NextRequest) {
  try {
    const down = await maintenanceBlock(); if (down) return down;
    const { db } = await connectToDatabase();
    return await submitKyc(db, request, 'artist', { resubmit: false });
  } catch (error) {
    console.error('Error submitting KYC:', error);
    return fail('Internal server error', 500);
  }
}
