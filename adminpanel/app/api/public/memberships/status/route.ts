import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import type { ObjectId } from 'mongodb';
import { fail, ok, toObjectId } from '@/lib/http';
import { requireAppUser } from '@/lib/app-auth';
import { daysUntil, effectiveStatus, phoneVariants, todayStart } from '@/lib/resources/memberships.hooks';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/memberships/status?phone=
 *
 * The caller's own membership status. The phone must belong to the caller
 * (requireAppUser: an app token for that phone, see lib/app-auth.ts). The
 * status is worked out from the expiry date at the time of the request, so a
 * lapsed membership is never reported as active.
 *
 * Returns only what the member may see about themselves: no admin names,
 * reasons, payment references or notes.
 */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, request.nextUrl.searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();
    const rows = await db
      .collection('membershipSubscriptions')
      .find({ memberPhone: { $in: phoneVariants(auth.phone) } })
      .sort({ expiresOn: -1 })
      .limit(20)
      .toArray();

    // Subscriptions entered before the plan name was stored on them: look the name up.
    const planIds = rows.filter((row) => !row.planName).map((row) => toObjectId(String(row.plan || ''))).filter(Boolean) as ObjectId[];
    const plans = planIds.length
      ? await db.collection('membershipPlans').find({ _id: { $in: planIds } }).project({ name: 1, audience: 1, billingPeriod: 1 }).toArray()
      : [];
    const planOf = new Map(plans.map((plan) => [String(plan._id), plan]));

    const today = todayStart();
    const memberships = rows.map((row) => {
      const status = effectiveStatus(row, today);
      return {
        id: String(row._id),
        planId: row.plan ? String(row.plan) : null,
        plan: row.planName || planOf.get(String(row.plan))?.name || '',
        audience: row.planAudience || planOf.get(String(row.plan))?.audience || '',
        billingPeriod: row.planBillingPeriod || planOf.get(String(row.plan))?.billingPeriod || '',
        status,
        active: status === 'active',
        startedOn: row.startedOn || null,
        expiresOn: row.expiresOn || null,
        daysLeft: status === 'active' ? daysUntil(row.expiresOn, today) : null,
        autoRenew: Boolean(row.autoRenew),
      };
    });

    return ok({
      isMember: memberships.some((m) => m.active),
      memberships,
      purchaseAvailable: false,
    });
  } catch (error) {
    console.error('Public membership status failed:', error);
    return fail('Could not load the membership status', 500);
  }
}
