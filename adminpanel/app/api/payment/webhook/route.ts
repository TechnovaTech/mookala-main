import crypto from 'crypto';
import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok } from '@/lib/http';
import { getRazorpayConfig } from '@/lib/razorpay';
import { verifyWebhookSignature } from '@/lib/razorpay-api';
import { handleWebhookEvent, trimWebhookPayload } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment/webhook (public: called by Razorpay)
 *
 * The signature in X-Razorpay-Signature is checked over the raw request body
 * with the webhook secret saved in Settings -> Payment Gateway. Every delivery
 * is written to `webhookEvents`, including ones with a bad signature. A
 * delivery that was already processed (same event id) is acknowledged and
 * skipped; a delivery that failed is processed again when Razorpay retries,
 * or when an admin replays it from Finance -> Reconciliation. Only a trimmed
 * payload is stored (see `trimWebhookPayload`): no card, UPI or contact details.
 */

let indexReady: Promise<unknown> | null = null;
function ensureIndex(db: Db) {
  if (!indexReady) {
    indexReady = db
      .collection('webhookEvents')
      .createIndex(
        { provider: 1, eventId: 1 },
        { unique: true, partialFilterExpression: { signatureValid: true } }
      )
      .catch((error) => {
        indexReady = null;
        throw error;
      });
  }
  return indexReady;
}

export async function POST(request: NextRequest) {
  const receivedAt = new Date();
  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    return fail('Could not read the request body', 400);
  }

  let body: any = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  const event = typeof body?.event === 'string' ? body.event.slice(0, 80) : 'unknown';
  const eventId =
    (request.headers.get('x-razorpay-event-id') || '').slice(0, 120) ||
    'body-' + crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 40);

  try {
    const { db } = await connectToDatabase();
    const config = await getRazorpayConfig();
    const signature = request.headers.get('x-razorpay-signature');
    const valid = verifyWebhookSignature(rawBody, signature, config.webhookSecret);

    if (!valid) {
      await db.collection('webhookEvents').insertOne({
        provider: 'razorpay',
        eventId,
        event,
        signatureValid: false,
        processed: false,
        error: !config.hasWebhookSecret
          ? 'No webhook secret is saved in Settings'
          : signature
          ? 'Signature did not match'
          : 'No signature header',
        payload: trimWebhookPayload(body),
        receivedAt,
      });
      return config.hasWebhookSecret
        ? fail('Invalid webhook signature', 400)
        : fail('The webhook secret is not configured', 503);
    }

    await ensureIndex(db);
    const log = db.collection('webhookEvents');
    const key = { provider: 'razorpay', eventId, signatureValid: true };

    try {
      await log.insertOne({ ...key, event, processed: false, error: null, payload: trimWebhookPayload(body), receivedAt, deliveries: 1 });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const existing = await log.findOne(key);
      await log.updateOne(key, { $inc: { deliveries: 1 }, $set: { lastReceivedAt: receivedAt } });
      if (existing?.processed) return ok({ duplicate: true });
    }

    try {
      const result = await handleWebhookEvent(db, event, trimWebhookPayload(body));
      await log.updateOne(key, { $set: { processed: true, error: null, result, processedAt: new Date() } });
      return ok({ processed: true });
    } catch (error: any) {
      console.error('Razorpay webhook handling failed:', error);
      await log.updateOne(key, { $set: { processed: false, error: String(error?.message || error).slice(0, 500) } });
      // A non-2xx answer makes Razorpay deliver the event again later.
      return fail('The webhook could not be processed', 500);
    }
  } catch (error) {
    console.error('POST /api/payment/webhook error:', error);
    return fail('The webhook could not be processed', 500);
  }
}
