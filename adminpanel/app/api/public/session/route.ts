import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { getAppPhone, profilesFor, signInRefusal } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * GET /api/public/session   (Authorization: Bearer <app token>)
 * Who the token belongs to and which roles the phone holds now, so an app can
 * decide where to go when it starts. 401 when the token is missing, expired or
 * not valid.
 */
export async function GET(request: NextRequest) {
  const phone = getAppPhone(request);
  if (!phone) return fail('Your session has expired. Please sign in again.', 401);

  try {
    const { db } = await connectToDatabase();
    const found = await profilesFor(db, phone);
    const refusal = signInRefusal(found);
    if (refusal) return fail(refusal, 403);

    return ok({ phone, roles: found.roles, profiles: found.profiles, restrictions: found.restrictions });
  } catch (error) {
    console.error('Session error:', error);
    return fail('Could not load the session', 500);
  }
}
