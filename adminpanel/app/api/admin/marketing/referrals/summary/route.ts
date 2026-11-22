import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { activeProgramme, programmeCounts, qualifyPendingReferrals } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

/**
 * GET: referral counts per programme (signed up, qualified, rewarded) and the
 * reward coupons issued. Referrals whose customer has since paid for a booking
 * are qualified first, so the counts are current.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'marketing:view');
  if (!check.ok) return check.response;
  try {
    const { db } = await connectToDatabase();
    const qualifiedNow = await qualifyPendingReferrals(db);
    const [counts, active] = await Promise.all([programmeCounts(db), activeProgramme(db)]);
    return ok({ ...counts, activeProgrammeId: active ? String(active._id) : null, qualifiedNow });
  } catch (error) {
    console.error('Referral summary failed:', error);
    return fail('Could not load the referral figures', 500);
  }
}
