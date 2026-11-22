import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAppUser } from '@/lib/app-auth';
import { CLAIM_WINDOW_DAYS, activeProgramme, publicProgramme, qualifyPendingReferrals, referralCodeFor, referralStats, REFERRALS } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/referrals/code?phone=
 *
 * The customer's own referral code (made on the first request), the programme
 * running now, how many people signed up with the code and how many of them
 * qualified, and whether this customer can still enter someone else's code.
 * Needs the app session for the phone.
 */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, request.nextUrl.searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();
    const phone = auth.phone;
    const user = await db.collection('users').findOne(
      { phone: { $in: [phone, `+91${phone}`, `91${phone}`] } },
      { projection: { createdAt: 1, accountStatus: 1 } }
    );
    if (!user) return NextResponse.json({ success: false, error: 'No customer account for this phone number' }, { status: 404 });
    if (user.accountStatus === 'suspended' || user.accountStatus === 'blocked') {
      return NextResponse.json({ success: false, error: 'This account cannot use referrals' }, { status: 403 });
    }

    await qualifyPendingReferrals(db, { phones: [phone] });
    const [code, programme, stats, claimed] = await Promise.all([
      referralCodeFor(db, phone),
      activeProgramme(db),
      referralStats(db, phone),
      db.collection(REFERRALS).findOne({ referredPhone: phone }, { projection: { status: 1, code: 1 } }),
    ]);
    const created = user.createdAt ? new Date(user.createdAt) : null;
    const inWindow = Boolean(created && Date.now() - created.getTime() <= CLAIM_WINDOW_DAYS * 24 * 3600 * 1000);

    return NextResponse.json({
      success: true,
      code,
      programme: publicProgramme(programme),
      referred: stats.signedUp,
      qualified: stats.qualified,
      // Whether the "Have a referral code?" field should be offered.
      canClaim: !claimed && inWindow && Boolean(programme),
      claimed: claimed ? { code: claimed.code, status: claimed.status } : null,
    });
  } catch (error) {
    console.error('Referral code lookup failed:', error);
    return NextResponse.json({ success: false, error: 'Could not load the referral code' }, { status: 500 });
  }
}
