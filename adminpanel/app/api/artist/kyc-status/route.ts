import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail } from '@/lib/http';
import { getAppPhone, kycStatusResponse } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * GET /api/artist/kyc-status?phone=
 * kycStatus: 'not_submitted' | 'pending' | 'approved' | 'rejected'.
 * canSubmit is true when documents may be sent now (never sent, or rejected).
 *
 * The Aadhaar and PAN numbers are returned only to a caller whose session
 * token proves this phone number. A call without a token (still accepted while
 * APP_AUTH_MODE is not 'enforce') receives them as empty strings, with
 * `documentNumbersHidden: true`, so knowing a phone number is not enough to
 * read someone's identity numbers.
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const response = await kycStatusResponse(db, request, 'artist', new URL(request.url).searchParams.get('phone'));
    if (response.status !== 200 || getAppPhone(request)) return response;
    const body = await response.json();
    return NextResponse.json({ ...body, aadharId: '', panId: '', documentNumbersHidden: true });
  } catch (error) {
    console.error('Error fetching KYC status:', error);
    return fail('Internal server error', 500);
  }
}
