import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  getRazorpayConfig,
  validateKeyId,
  verifyRazorpayCredentials,
} from '@/lib/razorpay';

export const dynamic = 'force-dynamic';

/**
 * "Test connection" for the admin panel.
 *
 * Body is optional:
 *  - { keyId, keySecret } -> tests the pair the admin just typed
 *  - {} or { keySecret: '' } -> tests the credentials currently saved
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'integrations:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => ({}));
    const saved = await getRazorpayConfig();

    const keyId =
      typeof body?.keyId === 'string' && body.keyId.trim() ? body.keyId.trim() : saved.keyId;

    const keySecret =
      typeof body?.keySecret === 'string' && body.keySecret.trim()
        ? body.keySecret.trim()
        : // Only reuse the saved secret when we are testing the saved key id.
          keyId === saved.keyId
          ? saved.keySecret
          : '';

    if (!keyId) {
      return NextResponse.json(
        { success: false, error: 'Enter a Razorpay Key ID to test.' },
        { status: 400 }
      );
    }

    const keyIdCheck = validateKeyId(keyId);
    if (!keyIdCheck.valid) {
      return NextResponse.json({ success: false, error: keyIdCheck.error }, { status: 400 });
    }

    if (!keySecret) {
      return NextResponse.json(
        {
          success: false,
          error: saved.secretDecryptFailed
            ? 'The stored Key Secret could not be read. Please enter it again.'
            : 'Enter the Razorpay Key Secret to test the connection.',
        },
        { status: 400 }
      );
    }

    const result = await verifyRazorpayCredentials(keyId, keySecret);

    return NextResponse.json(
      {
        success: result.valid,
        valid: result.valid,
        mode: keyId.startsWith('rzp_live_') ? 'live' : 'test',
        status: result.status,
        message: result.message,
        error: result.valid ? undefined : result.message,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('POST /api/settings/payment/verify error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to test the Razorpay connection' },
      { status: 500 }
    );
  }
}
