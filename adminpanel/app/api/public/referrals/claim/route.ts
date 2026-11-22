import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { readBody, requireAppUser } from '@/lib/app-auth';
import { claimReferral, publicProgramme } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

/**
 * POST /api/public/referrals/claim  { phone, code }
 *
 * A new customer enters a friend's referral code. Allowed once per phone, for
 * an account made in the last 7 days that has no bookings, never with the
 * customer's own code, and only while a referral programme is running. The
 * reward is given when the customer's first paid booking is confirmed.
 * Needs the app session for the phone.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    if (!body) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });

    const auth = requireAppUser(request, body.phone);
    if (!auth.ok) return auth.response;

    const { db } = await connectToDatabase();
    const result = await claimReferral(db, auth.phone, body.code);
    if (!result.ok) return NextResponse.json({ success: false, error: result.error, code: result.code }, { status: result.status });

    return NextResponse.json({
      success: true,
      referral: { code: result.referral.code, status: result.referral.status, programme: publicProgramme({ ...result.referral, name: result.referral.programmeName }) },
      message:
        result.referral.refereeReward > 0
          ? `Code accepted. You will get a ₹${result.referral.refereeReward} coupon after your first paid booking.`
          : 'Code accepted. Your friend is rewarded after your first paid booking.',
    });
  } catch (error) {
    console.error('Referral claim failed:', error);
    return NextResponse.json({ success: false, error: 'Could not save the referral code' }, { status: 500 });
  }
}
