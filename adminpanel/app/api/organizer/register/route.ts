import { NextRequest, NextResponse } from 'next/server';
import { maintenanceBlock } from '@/lib/maintenance';
import { connectToDatabase } from '@/lib/mongodb';
import { fail } from '@/lib/http';
import { registerRoleProfile } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** POST /api/organizer/register   { phone }   See registerRoleProfile in lib/app-auth.ts. */
export async function POST(request: NextRequest) {
  // Refused while the platform is under maintenance (see lib/maintenance.ts).
  const down = await maintenanceBlock(); if (down) return down;
  try {
    const { db } = await connectToDatabase();
    return await registerRoleProfile(db, request, 'organizer');
  } catch (error) {
    console.error('Registration error:', error);
    return fail('Registration failed', 500);
  }
}
