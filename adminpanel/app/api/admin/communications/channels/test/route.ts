import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { isChannel, sendTestMessage } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * Sends one real test message through the channel's provider to an address,
 * number or device token the admin typed. Super Admin only (provider keys),
 * explicit confirmation, audited. SMS tests use /channels/test-sms (OTP).
 *
 * Body: { channel, to, confirm: true, whatsappTemplate?, whatsappLanguage? }
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'integrations:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');
    if (!isChannel(body.channel)) return fail('Unknown channel');
    if (body.channel === 'sms') return fail('SMS text is not implemented: use "Send test OTP" on the SMS card.', 409);

    const to = asString(body.to, 4096);
    if (!to) {
      return fail(
        body.channel === 'email'
          ? 'Type the email address the test should go to'
          : body.channel === 'whatsapp'
          ? 'Type the WhatsApp number the test should go to'
          : 'Paste the device token the test should go to'
      );
    }
    if (body.confirm !== true) return fail('Confirm that a real message will be sent through the provider', 409);

    const { db } = await connectToDatabase();
    const result = await sendTestMessage(
      db,
      body.channel,
      { to, whatsappTemplate: asString(body.whatsappTemplate, 512), whatsappLanguage: asString(body.whatsappLanguage, 15) },
      check.admin.email || null
    );

    await logAudit({
      admin: check.admin,
      action: 'test_send',
      module: 'communications',
      entityType: 'notification-channel',
      entityId: body.channel,
      entityLabel: body.channel,
      after: {
        to: body.channel === 'push' ? `device …${to.slice(-8)}` : to,
        result: result.status,
        error: result.error,
        providerMessageId: result.providerMessageId,
      },
      meta: { deliveryLogId: result.logId },
      request,
    });

    return ok({ status: result.status, accepted: result.status === 'accepted', error: result.error, providerMessageId: result.providerMessageId, logId: result.logId });
  } catch (error) {
    console.error('Test message failed:', error);
    return fail('Failed to send the test message', 500);
  }
}
