import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { requestOtp } from '@/lib/otp';
import { otpFailure, readBody } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/user/register   { phone }
 * Sends a one-time password and makes sure a customer record exists
 * ('pending' until the code is verified through /api/user/verify-otp).
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  try {
    const { db } = await connectToDatabase();

    const sent = await requestOtp(db, { phone: body.phone, purpose: 'user-register', role: 'user', request });
    if (!sent.ok) return otpFailure(sent);
    const phone = sent.phone;

    const users = db.collection('users');
    const existing = await users.findOne({ phone }, { projection: { _id: 1 } });
    if (!existing) await users.insertOne({ phone, status: 'pending', createdAt: new Date() });

    return ok({
      message: sent.message,
      isExisting: Boolean(existing),
      ...(sent.devMode ? { devMode: true } : {}),
    });
  } catch (error) {
    console.error('Registration error:', error);
    return fail('Registration failed', 500);
  }
}
