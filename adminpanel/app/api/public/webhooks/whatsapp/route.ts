import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { applyReceipts, getChannelConfig, secretsMatch, verifyMetaSignature, type ProviderReceipt } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY = 1_000_000;

const STATUS: Record<string, ProviderReceipt['status']> = {
  sent: 'accepted',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

function deny(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Meta's webhook verification handshake: answers hub.challenge only when
 * hub.verify_token matches the verify token saved for WhatsApp.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const { db } = await connectToDatabase();
    const config = await getChannelConfig(db, 'whatsapp');
    const expected = config.secrets.verifyToken;
    const challenge = params.get('hub.challenge') || '';
    if (
      params.get('hub.mode') === 'subscribe' &&
      expected &&
      secretsMatch(params.get('hub.verify_token') || '', expected) &&
      /^[A-Za-z0-9_-]{1,200}$/.test(challenge)
    ) {
      return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return deny('Verification failed', 403);
  } catch (error) {
    console.error('WhatsApp webhook verification failed:', error);
    return deny('Verification failed', 500);
  }
}

/**
 * Message status updates from the WhatsApp Cloud API (sent, delivered, read,
 * failed). Checked with X-Hub-Signature-256 (HMAC-SHA256 of the raw body with
 * the app secret); refused when no app secret is saved or the signature does
 * not match. Each status is applied once (message id + status + time).
 * Incoming customer messages in the same webhook are ignored.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return deny('Payload too large', 413);

    const { db } = await connectToDatabase();
    const config = await getChannelConfig(db, 'whatsapp');
    const appSecret = config.secrets.appSecret;
    if (!appSecret) return deny('WhatsApp status updates are not set up: save the app secret under Channels & Providers', 401);
    if (!verifyMetaSignature(appSecret, request.headers.get('x-hub-signature-256'), raw)) return deny('Invalid signature', 401);

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return deny('Body is not JSON', 400);
    }

    const receipts: ProviderReceipt[] = [];
    for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        for (const item of Array.isArray(change?.value?.statuses) ? change.value.statuses : []) {
          const id = typeof item?.id === 'string' ? item.id : '';
          const name = typeof item?.status === 'string' ? item.status : '';
          if (!id || !name) continue;
          const seconds = Number(item.timestamp);
          const error = Array.isArray(item.errors) ? item.errors[0] : null;
          const detail = error
            ? [error.code ? `code ${error.code}` : '', error.title, error.message, error.error_data?.details].filter(Boolean).join(': ')
            : null;
          receipts.push({
            provider: 'meta',
            messageId: id,
            event: name,
            status: name in STATUS ? STATUS[name] : null,
            at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
            eventKey: `${id}:${name}:${item.timestamp || ''}`,
            detail,
          });
        }
      }
    }

    const result = await applyReceipts(db, receipts);
    return NextResponse.json({ success: true, received: receipts.length, ...result });
  } catch (error) {
    console.error('WhatsApp webhook failed:', error);
    return deny('Webhook processing failed', 500);
  }
}
