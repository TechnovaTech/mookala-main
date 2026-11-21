import type { Db } from 'mongodb';

/** Shared by the wishes endpoints: status lists and small order helpers. */

export const ORDER_STATUSES = ['created', 'paid', 'processing', 'delivered', 'failed', 'delayed', 'disputed', 'cancelled', 'refunded'];
export const PROBLEM_STATUSES = ['failed', 'delayed', 'disputed'];
/** Statuses in which an order is still waiting to be delivered. */
export const OPEN_STATUSES = ['created', 'paid', 'processing', 'delayed', 'failed', 'disputed'];
export const CHANNELS = ['whatsapp', 'sms', 'email', 'in_app'];

export const STAMP_FIELDS: Record<string, string> = {
  paid: 'paidAt',
  processing: 'processingAt',
  delivered: 'deliveredAt',
  failed: 'failedAt',
  delayed: 'delayedAt',
  disputed: 'disputedAt',
  cancelled: 'cancelledAt',
  refunded: 'refundedAt',
};

/** The resource (and so the screen and the audit entity type) an order belongs to. */
export function resourceOf(order: Record<string, any>) {
  return order.kind === 'custom' ? 'custom-wishes' : 'wish-orders';
}

export function screenOf(order: Record<string, any>) {
  return order.kind === 'custom' ? '/wishes/custom' : '/wishes/orders';
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A due date is a calendar day: the wish is overdue once that day has ended. */
export function endOfDueDay(value: unknown): Date | null {
  const date = toDate(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export async function templateTitles(db: Db, ids: string[]) {
  const { ObjectId } = await import('mongodb');
  const objectIds = Array.from(new Set(ids))
    .filter((id) => ObjectId.isValid(id) && id.length === 24)
    .map((id) => new ObjectId(id));
  if (objectIds.length === 0) return new Map<string, string>();
  const found = await db
    .collection('greetingTemplates')
    .find({ _id: { $in: objectIds } }, { projection: { title: 1 } })
    .toArray();
  return new Map(found.map((t) => [String(t._id), String(t.title || '')]));
}
