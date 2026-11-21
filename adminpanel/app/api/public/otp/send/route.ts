import { NextRequest, NextResponse } from 'next/server';
import { SEND_GAP_MS } from '@/lib/otp';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { requestOtp } from '@/lib/otp';
import { otpFailure, readBody } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/public/otp/send   { phone }
 * Sends a one-time password to the phone. The answer is the same whether or
 * not the phone has an account. `devMode: true` means no SMS was sent and the
 * test code is accepted (local testing only).
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  try {
    const { db } = await connectToDatabase();
    const sent = await requestOtp(db, { phone: body.phone, purpose: 'login', request });
    if (!sent.ok) return otpFailure(sent);
    return ok({
      message: sent.message,
      // How long the client must wait before it may ask for another code.
      retryAfterSeconds: Math.round(SEND_GAP_MS / 1000),
      ...(sent.devMode ? { devMode: true } : {}),
    });
  } catch (error) {
    console.error('OTP send error:', error);
    return fail('Could not send the code', 500);
  }
}
