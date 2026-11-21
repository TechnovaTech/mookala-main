import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok, toObjectId } from '@/lib/http';
import { wishOrderKey } from '@/lib/resources/wishes.hooks';
import { ORDER_STATUSES, STAMP_FIELDS, toDate } from '../../../_lib/orders';

export const dynamic = 'force-dynamic';

interface Stage {
  status: string;
  enteredAt: Date;
  leftAt: Date | null;
  /** Milliseconds spent in the stage; for the current stage, up to now. */
  durationMs: number;
  current: boolean;
  by: string | null;
  reason: string | null;
}

const FIELD_LABEL: Record<string, string> = {
  customerName: 'customer name',
  customerPhone: 'customer phone',
  template: 'template',
  recipientName: 'recipient name',
  message: 'message',
  deliveryChannel: 'delivery channel',
  deliveryContact: 'delivery contact',
  scheduledFor: 'scheduled time',
  amount: 'amount',
  paymentReference: 'payment reference',
  brief: 'brief',
  agreedPrice: 'agreed price',
  dueDate: 'due date',
};

/**
 * The order-level history of one wish order (template order or custom wish):
 * every stage it went through with who moved it, why and how long it stayed
 * there, built from the audit trail and checked against the stage timestamps
 * stored on the order, plus the ledger entries written for it. The ledger
 * entries are finance records: they are returned (and listed among the events)
 * only to an admin with 'finance:view'; for anyone else `ledger` is null.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'wishes:view');
  if (!check.ok) return check.response;

  const orderId = toObjectId(params.id);
  if (!orderId) return fail('Order not found', 404);

  try {
    const { db } = await connectToDatabase();
    const order = await db.collection('wishOrders').findOne({ _id: orderId });
    if (!order) return fail('Order not found', 404);

    const showLedger = can(check.admin, 'finance:view');
    const [audit, ledger] = await Promise.all([
      db
        .collection('auditLogs')
        .find({ entityType: { $in: ['wish-orders', 'custom-wishes'] }, entityId: params.id })
        .sort({ createdAt: 1 })
        .limit(500)
        .toArray(),
      showLedger
        ? db
            .collection('transactions')
            .find({ 'meta.recordKey': wishOrderKey(params.id) })
            .sort({ createdAt: 1 })
            .toArray()
        : Promise.resolve([] as any[]),
    ]);

    const now = new Date();
    const createdAt = toDate(order.createdAt) || now;
    const who = (entry: any) => entry.adminName || entry.adminEmail || null;

    /* Stages: "Created", then one per audited status change. */
    const stages: Stage[] = [
      { status: 'created', enteredAt: createdAt, leftAt: null, durationMs: 0, current: false, by: order.createdBy || null, reason: null },
    ];
    const statusChanges = audit.filter((entry) => entry.action === 'status_change' && typeof entry.after?.status === 'string');
    for (const entry of statusChanges) {
      stages.push({
        status: entry.after.status,
        enteredAt: toDate(entry.createdAt) || now,
        leftAt: null,
        durationMs: 0,
        current: false,
        by: who(entry),
        reason: entry.reason || null,
      });
    }
    // An order whose status changes were never audited (entered before the
    // audit trail existed) still gets its stages from the stored timestamps.
    let source: 'audit' | 'timestamps' = 'audit';
    if (statusChanges.length === 0 && order.status !== 'created') {
      source = 'timestamps';
      const stamped = ORDER_STATUSES.filter((status) => STAMP_FIELDS[status] && toDate(order[STAMP_FIELDS[status]]))
        .map((status) => ({ status, at: toDate(order[STAMP_FIELDS[status]]) as Date }))
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      for (const stamp of stamped) {
        stages.push({ status: stamp.status, enteredAt: stamp.at, leftAt: null, durationMs: 0, current: false, by: null, reason: null });
      }
      if (stages[stages.length - 1].status !== order.status) {
        stages.push({
          status: String(order.status),
          enteredAt: toDate(order.statusChangedAt) || toDate(order.updatedAt) || now,
          leftAt: null,
          durationMs: 0,
          current: false,
          by: order.statusChangedBy || null,
          reason: order.statusReason || null,
        });
      }
    }
    stages.forEach((stage, index) => {
      const next = stages[index + 1];
      stage.leftAt = next ? next.enteredAt : null;
      stage.current = !next;
      stage.durationMs = Math.max(0, (next ? next.enteredAt : now).getTime() - stage.enteredAt.getTime());
    });

    /* Everything else that happened to the order, in order. */
    const events: { at: Date; kind: string; text: string; by: string | null; reason: string | null }[] = [];
    for (const entry of audit) {
      const at = toDate(entry.createdAt) || now;
      if (entry.action === 'update') {
        const fields = Object.keys(entry.after || {}).filter((key) => key !== 'listPrice');
        const amount =
          entry.after && 'amount' in entry.after ? ` (amount ${entry.before?.amount ?? 'empty'} → ${entry.after.amount ?? 'empty'})` : '';
        events.push({
          at,
          kind: 'edit',
          text: `Edited: ${fields.map((key) => FIELD_LABEL[key] || key).join(', ') || 'details'}${amount}`,
          by: who(entry),
          reason: entry.reason || null,
        });
      } else if (entry.action === 'note') {
        events.push({ at, kind: 'note', text: `Note: ${String(entry.after?.note || '').slice(0, 300)}`, by: who(entry), reason: null });
      } else if (entry.action === 'assign_artist') {
        events.push({
          at,
          kind: 'artist',
          text: entry.before?.artistName
            ? `Artist changed from ${entry.before.artistName} to ${entry.after?.artistName || 'another artist'}`
            : `Artist assigned: ${entry.after?.artistName || ''}`,
          by: who(entry),
          reason: entry.reason || null,
        });
      } else if (entry.action === 'ledger_sync') {
        events.push({ at, kind: 'ledger', text: 'Missing ledger entry recorded from the Wishes Reports screen', by: who(entry), reason: entry.reason || null });
      }
    }
    for (const entry of ledger) {
      events.push({
        at: toDate(entry.createdAt) || now,
        kind: 'ledger',
        text: `Ledger ${String(entry.type).replace(/_/g, ' ')} ${entry.reference}: ₹${Number(entry.amount).toLocaleString('en-IN')}${
          entry.type === 'payment' ? ` (owed to ${entry.payeeType === 'platform' ? 'the platform' : entry.payeeName || entry.payeeType})` : ''
        }`,
        by: entry.createdBy || null,
        reason: null,
      });
    }
    events.sort((a, b) => a.at.getTime() - b.at.getTime());

    /* The timestamps stored on the order, and whether they agree with the audit trail. */
    const stamps: { status: string; field: string; at: Date | null; auditAt: Date | null; agrees: boolean }[] = [];
    for (const status of ORDER_STATUSES) {
      const field = STAMP_FIELDS[status];
      if (!field) continue;
      const at = toDate(order[field]);
      const entered = stages.filter((stage) => stage.status === status).map((stage) => stage.enteredAt);
      if (!at && entered.length === 0) continue;
      // "Paid" and "Processing" keep the first time; the other stages the latest.
      const auditAt = entered.length ? (status === 'paid' || status === 'processing' ? entered[0] : entered[entered.length - 1]) : null;
      stamps.push({
        status,
        field,
        at,
        auditAt,
        agrees: source === 'timestamps' ? true : Boolean(at && auditAt && Math.abs(at.getTime() - auditAt.getTime()) < 5000),
      });
    }

    const first = (status: string) => stages.find((stage) => stage.status === status)?.enteredAt || null;
    const last = (status: string) => {
      const found = stages.filter((stage) => stage.status === status);
      return found.length ? found[found.length - 1].enteredAt : null;
    };
    const between = (from: Date | null, to: Date | null) => (from && to && to.getTime() >= from.getTime() ? to.getTime() - from.getTime() : null);
    const paidAt = first('paid');
    const deliveredAt = order.status === 'delivered' ? last('delivered') : null;

    return ok({
      order: {
        id: String(order._id),
        kind: order.kind === 'custom' ? 'custom' : 'template',
        status: order.status,
        amount: Number(order.amount) || 0,
        dueDate: order.dueDate || null,
        scheduledFor: order.scheduledFor || null,
        retryCount: Number(order.retryCount) || 0,
      },
      source,
      stages,
      events,
      stamps,
      summary: {
        createdToPaidMs: between(createdAt, paidAt),
        paidToProcessingMs: between(paidAt, first('processing')),
        paidToDeliveredMs: between(paidAt, deliveredAt),
        createdToDeliveredMs: between(createdAt, deliveredAt),
      },
      ledger: !showLedger ? null : ledger.map((entry) => ({
        reference: entry.reference,
        type: entry.type,
        amount: entry.amount,
        payeeType: entry.payeeType || null,
        payeeName: entry.payeeName || null,
        createdAt: entry.createdAt,
        createdBy: entry.createdBy || null,
      })),
    });
  } catch (error) {
    console.error('Wish order timeline failed:', error);
    return fail('Failed to load the order history', 500);
  }
}
