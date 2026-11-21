import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail } from '@/lib/http';
import { registerRoleProfile } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** POST /api/artist/register   { phone }   See registerRoleProfile in lib/app-auth.ts. */
export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    return await registerRoleProfile(db, request, 'artist');
  } catch (error) {
    console.error('Registration error:', error);
    return fail('Registration failed', 500);
  }
}
