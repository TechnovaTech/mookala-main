import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import { UNVERIFIED_ERROR, canSubmitKyc, imageText, kycStateOf, phoneVerified, readBody, requireAppUser, text } from '@/lib/app-auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/** POST /api/organizer/profile   { phone, name?, email?, city?, profileImage? } */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Invalid request body', 400);

  const auth = requireAppUser(request, body.phone);
  if (!auth.ok) return auth.response;
  const phone = auth.phone;

  try {
    const { db } = await connectToDatabase();

    const organizer = await db.collection('organizers').findOne({ phone }, { projection: { status: 1 } });
    if (!organizer) return fail('User not found', 400);

    // A phone that has not passed OTP for this role may not fill in the profile.
    if (!phoneVerified(organizer)) return fail(UNVERIFIED_ERROR, 403);

    const restricted = await restrictionFor(db, 'organizers', phone);
    if (restricted) return fail(restricted, 403);

    const set: Record<string, any> = { updatedAt: new Date(), status: 'profile_completed' };
    const name = text(body.name, 120);
    const email = text(body.email, 200);
    const city = text(body.city, 120);
    const profileImage = imageText(body.profileImage);
    if (name) set.name = name;
    if (email) set.email = email;
    if (city) set.city = city;
    if (profileImage) set.profileImage = profileImage;

    await db.collection('organizers').updateOne({ phone }, { $set: set });
    return ok({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Organizer profile update error:', error);
    return fail('Profile update failed', 500);
  }
}

/** GET /api/organizer/profile?phone= */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, new URL(request.url).searchParams.get('phone'));
  if (!auth.ok) return auth.response;

  try {
    const { db } = await connectToDatabase();
    const user = await db.collection('organizers').findOne({ phone: auth.phone });
    if (!user) return fail('User not found', 404);

    return ok({
      user: {
        phone: user.phone,
        name: user.name || '',
        email: user.email || '',
        city: user.city || '',
        profileImage: user.profileImage || null,
        status: user.status || 'pending',
        kycStatus: kycStateOf(user),
        canSubmitKyc: canSubmitKyc(user),
      },
    });
  } catch (error) {
    console.error('Organizer profile error:', error);
    return fail('Failed to fetch profile', 500);
  }
}
