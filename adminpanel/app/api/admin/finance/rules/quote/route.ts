import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { asString, fail, ok } from '@/lib/http';
import { SERVICES, type Service } from '@/lib/ledger';
import { findRefundRule, quoteRefund } from '@/lib/refund-rules';

export const dynamic = 'force-dynamic';

/**
 * "Try it" for the refund rules: which active rule applies to a cancellation
 * and what it refunds. Uses the same functions as a real cancellation.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'refunds:view');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const service = asString(body.service, 40);
    if (!SERVICES.some((s) => s.value === service)) return fail('Choose a service');

    const hours = Number(body.hoursBefore);
    if (body.hoursBefore === '' || body.hoursBefore == null || !Number.isFinite(hours) || hours < 0) {
      return fail('Hours before the event must be a number, 0 or more');
    }

    const amountPaid = Number(body.amountPaid);
    if (body.amountPaid === '' || body.amountPaid == null || !Number.isFinite(amountPaid) || amountPaid <= 0) {
      return fail('Amount paid must be a number above 0');
    }

    const { db } = await connectToDatabase();
    const rule = await findRefundRule(db, service as Service, hours);
    const quote = quoteRefund(amountPaid, rule);
    const activeRules = await db.collection('refundRules').countDocuments({ service, status: 'active' });

    return ok({ quote, amountPaid, hoursBefore: hours, service, activeRules });
  } catch (error) {
    console.error('Refund quote failed:', error);
    return fail('Failed to work out the refund', 500);
  }
}
