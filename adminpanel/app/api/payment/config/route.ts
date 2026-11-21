import { NextResponse } from 'next/server';
import { getRazorpayConfig } from '@/lib/razorpay';
import { connectToDatabase } from '@/lib/mongodb';
import { HOLD_MINUTES } from '@/lib/bookings';
import { describePolicy } from '@/lib/refund-rules';

/**
 * Public payment configuration consumed by the website and the mobile apps.
 *
 * The Key ID now comes from the credentials an admin saved in
 * Settings -> Payment Gateway, falling back to RAZORPAY_KEY_ID when nothing
 * has been saved yet. The Key Secret is never exposed here.
 *
 * `refundPolicy` lists the ticket cancellation rules in force, so clients can
 * show the policy before the customer pays (requirements section 11).
 */

// Always read live values - never let Next.js cache this response.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
};

export async function GET() {
  try {
    const config = await getRazorpayConfig();

    // Razorpay Checkout only needs the public Key ID. When the gateway is
    // switched off, or no key is set, we report an empty key so clients fall
    // back to their non-Razorpay flow.
    const active = config.enabled && config.hasKeyId;

    let refundPolicy: Record<string, any>[] = [];
    try {
      const { db } = await connectToDatabase();
      const rules = await db
        .collection('refundRules')
        .find({ service: 'ticketing', status: 'active' })
        .sort({ minHoursBefore: -1 })
        .limit(50)
        .toArray();
      // Published as non-overlapping windows, latest cancellation time last,
      // so a customer never sees two rules for the same moment. The field
      // names are the ones the clients already read.
      refundPolicy = describePolicy(rules as any[])
        .windows.filter((window) => window.rule)
        .reverse()
        .map((window) => ({
          name: window.rule!.name,
          minHoursBefore: window.fromHours,
          maxHoursBefore: window.toHours,
          refundPercent: window.rule!.refundPercent,
          deductionFlat: window.rule!.deductionFlat,
        }));
    } catch (error) {
      console.error('Could not read the refund rules:', error);
    }

    return NextResponse.json(
      {
        success: true,
        provider: 'razorpay',
        currency: 'INR',
        enabled: active,
        configured: config.isConfigured,
        mode: active ? config.mode : null,
        razorpayKeyId: active ? config.keyId : '',
        keyId: active ? config.keyId : '',
        holdMinutes: HOLD_MINUTES,
        refundPolicy,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('GET /api/payment/config error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get payment config' },
      { status: 500, headers: NO_STORE }
    );
  }
}
