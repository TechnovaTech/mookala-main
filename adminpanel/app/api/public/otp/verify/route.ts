import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { checkOtp } from '@/lib/otp';
import { issueAppToken, otpFailure, profilesFor, readBody, signInRefusal, type AppRole } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

function roleOf(value: unknown): AppRole | null {
  return value === 'user' || value === 'artist' || value === 'organizer' ? value : null;
}

/**
 * POST /api/public/otp/verify   { phone, otp, role? }
 * Checks the code and returns the session token with the roles the phone
 * holds. It creates no account. Send the optional `role` when the client is
 * signing in to one specific role: then only that role's suspension or block
 * refuses the sign-in. Without it the sign-in is refused only when every
 * account the phone has is restricted; restricted roles are left out of
 * `roles` and explained in `restrictions`.
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);
  const role = roleOf(body.role);

  try {
    const { db } = await connectToDatabase();
    const checked = await checkOtp(db, { phone: body.phone, otp: body.otp, role, request });
    if (!checked.ok) return otpFailure(checked);

    const found = await profilesFor(db, checked.phone);
    const refusal = signInRefusal(found, role);
    if (refusal) return fail(refusal, 403);

    return ok({
      token: issueAppToken(checked.phone),
      phone: checked.phone,
      roles: found.roles,
      profiles: found.profiles,
      restrictions: found.restrictions,
      ...(checked.devMode ? { devMode: true } : {}),
    });
  } catch (error) {
    console.error('OTP verify error:', error);
    return fail('Could not verify the code', 500);
  }
}
