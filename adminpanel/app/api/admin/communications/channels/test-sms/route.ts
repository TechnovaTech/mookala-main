import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, ok } from '@/lib/http';
import { sendOtpSms } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * Sends a real test OTP through 2Factor. This costs SMS credits, so the caller
 * must name the destination and confirm explicitly.
 */
export async function POST(request: NextRequest) {
  // Sends a real, charged SMS with the saved provider key.
  const check = await requireAdmin(request, 'integrations:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');

    const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s\-()]/g, '') : '';
    if (!/^\+?\d{10,13}$/.test(phone)) return fail('Type the phone number the test SMS should go to');
    if (body.confirm !== true) return fail('Confirm that a real, charged SMS will be sent to this number', 409);

    const { db } = await connectToDatabase();
    const result = await sendOtpSms(db, phone, { requestedBy: check.admin.email || null });

    await logAudit({
      admin: check.admin,
      action: 'test_send',
      module: 'communications',
      entityType: 'notification-channel',
      entityId: 'sms',
      entityLabel: 'SMS',
      after: { to: phone, accepted: result.ok, error: result.error },
      request,
    });

    // The session id is not returned: it is only useful to the sign-in flow.
    return ok({ accepted: result.ok, error: result.error });
  } catch (error) {
    console.error('Test SMS failed:', error);
    return fail('Failed to send the test SMS', 500);
  }
}
