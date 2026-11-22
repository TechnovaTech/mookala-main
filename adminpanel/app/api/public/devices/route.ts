import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { readBody, requireAppUser } from '@/lib/app-auth';
import { isDeviceToken, registerDeviceToken, removeDeviceToken, type DeviceApp, type DevicePlatform } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const PLATFORMS: DevicePlatform[] = ['android', 'ios', 'web'];
const APPS: DeviceApp[] = ['user', 'organizer'];

function deny(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Push device tokens for the apps.
 *
 *   POST    { phone, token, platform: android|ios|web, app: user|organizer }
 *           saves the Firebase Cloud Messaging token of this device for the
 *           phone (moving it if another phone had it).
 *   DELETE  { phone, token }   (or ?phone=&token=)   on sign-out.
 *
 * Needs the app session token (Authorization: Bearer) for the same phone:
 * requests without one are refused even while APP_AUTH_MODE allows them
 * elsewhere, because a token registered for someone else's number would
 * receive that person's notifications. The phone must have an account for
 * the app (a customer for "user", an artist or organiser for "organizer").
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    if (!body) return deny('Invalid request body', 400);

    const auth = requireAppUser(request, body.phone);
    if (!auth.ok) return auth.response;
    if (auth.legacy) return deny('Please sign in again to turn on notifications.', 401);

    if (!isDeviceToken(body.token)) return deny('A valid device token is required', 400);
    if (!PLATFORMS.includes(body.platform)) return deny('platform must be android, ios or web', 400);
    if (!APPS.includes(body.app)) return deny('app must be user or organizer', 400);

    const { db } = await connectToDatabase();
    const holders = body.app === 'user' ? ['users'] : ['artists', 'organizers'];
    const found = await Promise.all(holders.map((name) => db.collection(name).findOne({ phone: auth.phone }, { projection: { _id: 1 } })));
    if (!found.some(Boolean)) return deny('No account for this phone number in this app', 404);

    const result = await registerDeviceToken(db, { phone: auth.phone, token: body.token, platform: body.platform, app: body.app });
    return NextResponse.json({ success: true, registered: true, created: result.created });
  } catch (error) {
    console.error('Device registration failed:', error);
    return deny('Could not register the device', 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const body = (await readBody(request)) || {};
    const phone = body.phone ?? params.get('phone');
    const token = body.token ?? params.get('token');

    const auth = requireAppUser(request, phone);
    if (!auth.ok) return auth.response;
    if (auth.legacy) return deny('Please sign in again to continue.', 401);
    if (!isDeviceToken(token)) return deny('A valid device token is required', 400);

    const { db } = await connectToDatabase();
    const removed = await removeDeviceToken(db, { phone: auth.phone, token });
    return NextResponse.json({ success: true, removed });
  } catch (error) {
    console.error('Device removal failed:', error);
    return deny('Could not remove the device', 500);
  }
}
