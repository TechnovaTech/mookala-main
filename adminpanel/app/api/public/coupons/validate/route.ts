import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { evaluateCoupon } from '@/lib/resources/marketing.hooks';

export const dynamic = 'force-dynamic';

/**
 * Checks a coupon for an order without redeeming it.
 *   POST { code, service, amount, userPhone }
 *   ->   { valid, reason, code, discount, payable, discountType, value, description }
 *
 * Only what a customer may see is returned: no usage counts, limits or dates.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail('Invalid request body');
  if (typeof body.code !== 'string' || !body.code.trim()) return fail('Coupon code is required');
  if (typeof body.service !== 'string' || !body.service) return fail('Service is required');
  const amount = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount ?? ''));
  if (!Number.isFinite(amount) || amount <= 0) return fail('Order amount must be a number greater than zero');

  try {
    const { db } = await connectToDatabase();
    const result = await evaluateCoupon(db, { code: body.code, service: body.service, amount, userPhone: body.userPhone });

    return ok({
      valid: result.valid,
      reason: result.reason,
      code: result.code,
      discount: result.discount,
      payable: result.payable,
      ...(result.valid
        ? {
            discountType: result.coupon.discountType,
            value: result.coupon.value,
            description: result.coupon.description || '',
          }
        : {}),
    });
  } catch (error) {
    console.error('Coupon validation failed:', error);
    return fail('The coupon could not be checked', 500);
  }
}
