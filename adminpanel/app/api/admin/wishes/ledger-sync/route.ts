import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { recordWishPayment, recordWishRefund } from '@/lib/resources/wishes.hooks';
import { resourceOf } from '../_lib/orders';
import { ledgerPicture } from '../_lib/ledger';

export const dynamic = 'force-dynamic';

/**
 * Writes the ledger entries that are missing for wish orders already marked
 * paid or refunded: orders entered before payments were written to the
 * ledger, or an order whose ledger write failed. Each entry is written once
 * (the ledger helper ignores a second attempt) and is marked as recorded by an
 * admin. Needs a reason and is audited per order.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'wishes:manage');
  if (!check.ok) return check.response;

  try {
    const body = await request.json().catch(() => null);
    const reason = asString(body?.reason).trim();
    if (!reason) return fail('A reason is required.');

    const { db } = await connectToDatabase();
    const orders = await db.collection('wishOrders').find({ paidAt: { $exists: true, $ne: null } }).toArray();
    const before = await ledgerPicture(db, orders);
    const byId = new Map(orders.map((order) => [String(order._id), order]));

    let payments = 0;
    let refunds = 0;
    const skipped: { id: string; why: string }[] = [];

    for (const gap of before.gaps) {
      const order = byId.get(gap.id);
      if (!order) continue;
      if (gap.blocked) {
        skipped.push({ id: gap.id, why: gap.blocked });
        continue;
      }
      const written: Record<string, string> = {};
      if (gap.missing === 'payment') {
        const payment = await recordWishPayment(db, order, check.admin.email);
        if (!payment) {
          skipped.push({ id: gap.id, why: 'The payment could not be written.' });
          continue;
        }
        payments += 1;
        written.ledgerReference = payment.reference;
      }
      if (order.status === 'refunded') {
        const refund = await recordWishRefund(db, order, check.admin.email);
        if (refund) {
          refunds += 1;
          written.refundReference = refund.reference;
        }
      }
      await logAudit({
        admin: check.admin,
        action: 'ledger_sync',
        module: 'wishes',
        entityType: resourceOf(order),
        entityId: gap.id,
        entityLabel: String(order.recipientName || ''),
        before: { ledgerReference: order.ledgerReference || null, refundReference: order.refundReference || null },
        after: written,
        reason,
        request,
      });
    }

    return ok({ payments, refunds, skipped });
  } catch (error) {
    console.error('Wishes ledger sync failed:', error);
    return fail('Failed to record the missing ledger entries', 500);
  }
}
