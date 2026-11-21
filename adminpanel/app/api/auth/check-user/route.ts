import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail } from '@/lib/http';
import { normalisePhone } from '@/lib/otp';
import { PHONE_ERROR, readBody } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/auth/check-user   { phone }
 * Says whether the phone has an artist and/or organiser profile, whatever its
 * signup status. A phone may hold both roles: `roles` lists every one. `role`
 * and `user` describe the first of them (artist before organiser) and exist
 * for app builds that predate `roles`; `users` has the same details per role.
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const phone = normalisePhone(body?.phone);
  if (!phone) return fail(PHONE_ERROR, 400);

  try {
    const { db } = await connectToDatabase();
    const projection = { phone: 1, status: 1, name: 1 };
    const [artist, organizer] = await Promise.all([
      db.collection('artists').findOne({ phone }, { projection }),
      db.collection('organizers').findOne({ phone }, { projection }),
    ]);

    const summary = (doc: any) => ({ phone: doc.phone, _id: doc._id, status: doc.status, name: doc.name || null });
    const roles = [...(artist ? ['artist'] : []), ...(organizer ? ['organizer'] : [])];
    const first = artist || organizer;

    if (!first) return NextResponse.json({ exists: false, roles: [] });

    return NextResponse.json({
      exists: true,
      role: roles[0],
      roles,
      user: summary(first),
      users: {
        artist: artist ? summary(artist) : null,
        organizer: organizer ? summary(organizer) : null,
      },
    });
  } catch (error) {
    console.error('Check user error:', error);
    return fail('Check user failed', 500);
  }
}
