import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { applyReceipts, getChannelConfig, verifySvixSignature, type ProviderReceipt } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY = 1_000_000;

const STATUS: Record<string, ProviderReceipt['status']> = {
  'email.sent': 'accepted',
  'email.delivered': 'delivered',
  'email.opened': 'read',
  'email.clicked': 'read',
  'email.bounced': 'failed',
  'email.failed': 'failed',
  'email.delivery_delayed': null,
  'email.complained': null,
};

function deny(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Resend webhook: delivery receipts for email sent through Resend. Signed the
 * Svix way (svix-id, svix-timestamp, svix-signature) with the signing secret
 * saved under Channels & Providers; anything unsigned, wrongly signed or more
 * than 5 minutes old is refused. Each event is applied once, by svix-id.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return deny('Payload too large', 413);

    const { db } = await connectToDatabase();
    const config = await getChannelConfig(db, 'email');
    const secret = config.secrets.signingSecret;
    if (!secret) return deny('Resend status updates are not set up: save the webhook signing secret under Channels & Providers', 401);

    const headers = {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    };
    if (!verifySvixSignature(secret, headers, raw)) return deny('Invalid signature', 401);

    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return deny('Body is not JSON', 400);
    }
    const type = typeof event?.type === 'string' ? event.type : '';
    const emailId = typeof event?.data?.email_id === 'string' ? event.data.email_id : '';
    if (!type || !emailId) return NextResponse.json({ success: true, received: 0, applied: 0, duplicates: 0, unmatched: 0 });

    const at = new Date(event.created_at || Date.now());
    const detail = event.data?.bounce?.message || event.data?.failed?.reason || event.data?.bounce?.subType || null;
    const result = await applyReceipts(db, [
      {
        provider: 'resend',
        messageId: emailId,
        event: type,
        status: type in STATUS ? STATUS[type] : null,
        at: Number.isNaN(at.getTime()) ? new Date() : at,
        eventKey: headers.id as string,
        detail: typeof detail === 'string' ? detail : null,
      },
    ]);
    return NextResponse.json({ success: true, received: 1, ...result });
  } catch (error) {
    console.error('Resend webhook failed:', error);
    return deny('Webhook processing failed', 500);
  }
}
