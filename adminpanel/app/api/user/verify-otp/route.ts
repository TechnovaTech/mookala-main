import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import { issueAppToken, proveOwnership, readBody } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/user/verify-otp   { phone, otp }
 * Signs a customer in. The code is checked by the OTP service; a valid app
 * token for the same phone (Authorization: Bearer) is accepted in place of
 * `otp`. Creates the customer record on first sign-in and returns `token`.
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  try {
    const { db } = await connectToDatabase();

    const proof = await proveOwnership(db, request, { phone: body.phone, otp: body.otp, role: 'user' });
    if (!proof.ok) return proof.response;
    const phone = proof.phone;

    const restricted = await restrictionFor(db, 'users', phone);
    if (restricted) return fail(restricted, 403);

    const users = db.collection('users');
    const existing = await users.findOne({ phone });
    const now = new Date();

    if (!existing) {
      await users.insertOne({ phone, status: 'verified', createdAt: now, updatedAt: now });
    } else {
      await users.updateOne(
        { phone },
        {
          // A finished profile stays 'completed'; anything earlier becomes 'verified'.
          $set: existing.status === 'completed' ? { updatedAt: now } : { status: 'verified', updatedAt: now },
          $unset: { otp: 1 },
        }
      );
    }

    const status = existing?.status === 'completed' ? 'completed' : 'verified';
    const name = existing?.name || null;

    return ok({
      message: 'OTP verified successfully',
      isNewUser: !existing,
      isProfileComplete: status === 'completed' && Boolean(name),
      user: { phone, status, name },
      token: issueAppToken(phone),
      ...(proof.devMode ? { devMode: true } : {}),
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return fail('OTP verification failed', 500);
  }
}
