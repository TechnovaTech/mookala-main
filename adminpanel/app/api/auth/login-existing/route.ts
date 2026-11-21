import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import { ROLE_COLLECTION, issueAppToken, kycStateOf, proveOwnership, readBody } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/auth/login-existing   { phone, role: 'artist' | 'organizer', otp? }
 * Signs a returning artist or organiser in. A phone number alone is never
 * enough: the request needs a valid app token for the phone
 * (Authorization: Bearer) or an `otp` that was requested through
 * /api/public/otp/send. Returns `token`.
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);
  if (!body.phone || !body.role) return fail('Phone and role required', 400);

  const role: 'artist' | 'organizer' | null =
    body.role === 'artist' || body.role === 'organizer' ? body.role : null;
  if (!role) return fail('Role must be artist or organizer', 400);

  try {
    const { db } = await connectToDatabase();

    const proof = await proveOwnership(db, request, { phone: body.phone, otp: body.otp, role });
    if (!proof.ok) return proof.response;
    const phone = proof.phone;

    const restricted = await restrictionFor(db, ROLE_COLLECTION[role], phone);
    if (restricted) return fail(restricted, 403);

    const user = await db.collection(ROLE_COLLECTION[role]).findOne(
      { phone, status: { $in: ['verified', 'completed', 'profile_completed'] } },
      { projection: { phone: 1, status: 1, name: 1, kycStatus: 1, aadharId: 1 } }
    );
    if (!user) return fail('User not found or not verified', 400);

    return ok({
      message: 'Login successful',
      user: {
        phone: user.phone,
        role,
        status: user.status,
        name: user.name || null,
        kycStatus: kycStateOf(user),
      },
      token: issueAppToken(phone),
      ...(proof.devMode ? { devMode: true } : {}),
    });
  } catch (error) {
    console.error('Login error:', error);
    return fail('Login failed', 500);
  }
}
