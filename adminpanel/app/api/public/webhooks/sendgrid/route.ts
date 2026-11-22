import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { applyReceipts, getChannelConfig, verifySendgridSignature, verifySharedSecret, type ProviderReceipt } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY = 1_000_000;

/** SendGrid event names and the delivery status each one means. */
const STATUS: Record<string, ProviderReceipt['status']> = {
  processed: 'accepted',
  delivered: 'delivered',
  open: 'read',
  click: 'read',
  bounce: 'failed',
  dropped: 'failed',
  deferred: null,
  spamreport: null,
  unsubscribe: null,
  group_unsubscribe: null,
  group_resubscribe: null,
};

function deny(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * SendGrid Event Webhook: delivery receipts for email sent through SendGrid.
 *
 * Checked with the "Signed Event Webhook" verification key when one is saved
 * (ECDSA signature over timestamp + body). Without a key, the URL must carry
 * ?key=<webhook URL key> saved under Channels & Providers. Anything else is
 * refused. Each event is applied once, by sg_event_id.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return deny('Payload too large', 413);

    const { db } = await connectToDatabase();
    const config = await getChannelConfig(db, 'email');
    const publicKey = config.values.webhookPublicKey;
    const shared = config.secrets.webhookSecret;

    if (publicKey) {
      const signature = request.headers.get('x-twilio-email-event-webhook-signature');
      const timestamp = request.headers.get('x-twilio-email-event-webhook-timestamp');
      if (!signature || !timestamp || !verifySendgridSignature(publicKey, signature, timestamp, raw)) {
        return deny('Invalid signature', 401);
      }
    } else if (shared) {
      if (!verifySharedSecret(shared, request.nextUrl.searchParams.get('key'))) return deny('Invalid key', 401);
    } else {
      return deny('SendGrid status updates are not set up: save a verification key or a webhook URL key under Channels & Providers', 401);
    }

    let events: any;
    try {
      events = JSON.parse(raw);
    } catch {
      return deny('Body is not JSON', 400);
    }
    if (!Array.isArray(events)) return deny('Expected a list of events', 400);

    const receipts: ProviderReceipt[] = [];
    for (const event of events.slice(0, 1000)) {
      const name = typeof event?.event === 'string' ? event.event : '';
      const fullId = typeof event?.sg_message_id === 'string' ? event.sg_message_id : '';
      if (!name || !fullId) continue;
      const seconds = Number(event.timestamp);
      const detail = [event.reason, event.response, event.status, event.type].filter((v) => typeof v === 'string' && v).join(' | ');
      receipts.push({
        provider: 'sendgrid',
        // sg_message_id is the X-Message-Id returned on send, followed by ".filter..." details.
        messageId: fullId.split('.')[0],
        event: name,
        status: name in STATUS ? STATUS[name] : null,
        at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
        eventKey: typeof event.sg_event_id === 'string' && event.sg_event_id ? event.sg_event_id : `${fullId}:${name}:${event.timestamp}`,
        detail: detail || null,
      });
    }

    const result = await applyReceipts(db, receipts);
    return NextResponse.json({ success: true, received: receipts.length, ...result });
  } catch (error) {
    console.error('SendGrid webhook failed:', error);
    return deny('Webhook processing failed', 500);
  }
}
