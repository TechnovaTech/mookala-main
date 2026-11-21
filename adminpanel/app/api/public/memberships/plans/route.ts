import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

const AUDIENCES = ['user', 'artist', 'organiser'];

/**
 * GET /api/public/memberships/plans[?audience=user|artist|organiser]
 *
 * The active membership plans, for the website and the apps. Public fields
 * only: no admin names, reasons or internal dates. Buying a plan is not
 * available yet (`purchaseAvailable: false`): there is no purchase endpoint,
 * because nothing verifies a membership payment with the gateway.
 */
export async function GET(request: NextRequest) {
  const audience = request.nextUrl.searchParams.get('audience');
  if (audience !== null && !AUDIENCES.includes(audience)) return fail('Unknown audience. Use user, artist or organiser.');

  try {
    const { db } = await connectToDatabase();
    const plans = await db
      .collection('membershipPlans')
      .find({ status: 'active', ...(audience ? { audience } : {}) })
      .sort({ audience: 1, price: 1 })
      .limit(100)
      .toArray();

    return ok({
      purchaseAvailable: false,
      plans: plans.map((plan) => ({
        id: String(plan._id),
        name: plan.name || '',
        audience: plan.audience || '',
        price: Number(plan.price) || 0,
        currency: 'INR',
        billingPeriod: plan.billingPeriod || '',
        benefits: Array.isArray(plan.benefits) ? plan.benefits : [],
        description: plan.description || '',
      })),
    });
  } catch (error) {
    console.error('Public membership plans failed:', error);
    return fail('Could not load the membership plans', 500);
  }
}
