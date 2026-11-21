import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail } from '@/lib/http';
import { verifyRoleProfile } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** POST /api/organizer/verify-otp   { phone, otp }   See verifyRoleProfile in lib/app-auth.ts. */
export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    return await verifyRoleProfile(db, request, 'organizer');
  } catch (error) {
    console.error('OTP verification error:', error);
    return fail('OTP verification failed', 500);
  }
}
