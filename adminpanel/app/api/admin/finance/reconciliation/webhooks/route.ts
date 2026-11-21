import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { HANDLED_EVENTS, handleWebhookEvent } from '@/app/api/payment/shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/finance/reconciliation/webhooks ('finance:manage')
 *   { id, reason }
 *
 * Replays one stored webhook delivery whose processing did not finish: the
 * same handler runs again on the payload that was stored when it arrived.
 * Only a delivery with a valid signature can be replayed, so nothing that did
 * not come from Razorpay is ever acted on. The handler does its work at most
 * once, so replaying is safe however many times it is pressed.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:manage');
  if (!check.ok) return check.response;

  const body = await request.json().catch(() => null);
  const oid = toObjectId(asString(body?.id, 40));
  const reason = asString(body?.reason, 500);
  if (!oid) return fail('A valid webhook delivery ID is required.');

  try {
    const { db } = await connectToDatabase();
    const events = db.collection('webhookEvents');
    const delivery = await events.findOne({ _id: oid });
    if (!delivery) return fail('Webhook delivery not found.', 404);
    if (delivery.signatureValid !== true) {
      return fail('This delivery did not carry a valid signature, so it cannot be trusted or replayed.', 409);
    }
    if (delivery.processed === true) return fail('This delivery was already processed. Nothing was replayed.', 409);

    const name = String(delivery.event || '');
    const audit = (after: Record<string, any>) =>
      logAudit({
        admin: check.admin,
        action: 'webhook_replay',
        module: 'finance',
        entityType: 'webhookEvent',
        entityId: String(delivery._id),
        entityLabel: `${name} · ${delivery.eventId || ''}`,
        before: { processed: false, error: delivery.error || null },
        after,
        reason: reason || null,
        request,
      });
    const now = new Date();
    const replay = { replayedAt: now, replayedBy: check.admin.email || null };

    if (!delivery.payload || typeof delivery.payload !== 'object') {
      return fail('No payload was stored for this delivery, so it cannot be replayed.', 409);
    }

    try {
      const result = await handleWebhookEvent(db, name, delivery.payload as any, 'replay by ' + (check.admin.email || 'admin'));
      await events.updateOne(
        { _id: oid },
        { $set: { processed: true, error: null, result, processedAt: now, ...replay }, $inc: { replays: 1 } }
      );
      await audit({ processed: true, result });
      return ok({
        processed: true,
        result,
        handled: HANDLED_EVENTS.includes(name),
        message: HANDLED_EVENTS.includes(name) ? 'Replayed: ' + result : `Marked as processed: '${name}' is an event this server does not act on.`,
      });
    } catch (error: any) {
      const message = String(error?.message || error).slice(0, 500);
      console.error('Webhook replay failed:', error);
      await events.updateOne({ _id: oid }, { $set: { processed: false, error: message, ...replay }, $inc: { replays: 1 } });
      await audit({ processed: false, error: message });
      return fail('The replay failed again: ' + message, 502);
    }
  } catch (error) {
    console.error('Webhook replay error:', error);
    return fail('Could not replay the delivery.', 500);
  }
}
