import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { fail, ok, parseAmount } from '@/lib/http';
import { roundMoney } from '@/lib/ledger';
import { expireStaleHolds, unverifiedTicketTotals } from '@/lib/bookings';
import { financeOverview, resolveRange } from '@/lib/reporting';
import { syncPaymentStates } from '../payments/shared';

export const dynamic = 'force-dynamic';

/**
 * Finance overview figures for a date range, computed from the ledger, plus
 * the payment states the ledger alone cannot give:
 *  - pending payments are bookings awaiting payment against a gateway order
 *    right now (they are not money yet, so they are not ledger entries);
 *  - unverified tickets are bookings issued without the gateway confirming a
 *    payment (old app versions, demonstration mode). They are in no figure.
 *  - refunded payments are payments returned in full, and the amount held back
 *    from payees is the value of payments under dispute.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'finance:view');
  if (!check.ok) return check.response;

  const range = resolveRange(request.nextUrl.searchParams, 'month');
  if (typeof range === 'string') return fail(range);

  try {
    const { db } = await connectToDatabase();
    await syncPaymentStates(db);
    await expireStaleHolds(db);
    const created = { $gte: range.start, $lt: range.end };

    const [overview, pendingRows, unverified, refunded, held] = await Promise.all([
      financeOverview(db, range),
      db
        .collection('bookings')
        .find({ status: 'pending_payment', gatewayOrderId: { $type: 'string', $ne: '' } }, { projection: { totalPrice: 1 } })
        .limit(5000)
        .toArray(),
      unverifiedTicketTotals(db),
      db
        .collection('transactions')
        .aggregate([
          { $match: { type: 'payment', createdAt: created, $or: [{ status: 'refunded' }, { status: 'success', refundState: 'full' }] } },
          { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$amount' } } },
        ])
        .toArray(),
      db
        .collection('transactions')
        .aggregate([
          { $match: { status: 'disputed' } },
          { $group: { _id: '$type', total: { $sum: '$amount' } } },
        ])
        .toArray(),
    ]);

    const heldOf = (type: string) => held.find((row) => row._id === type)?.total || 0;
    const ledgerPending = overview.pendingPayments;

    return ok({
      ...overview,
      // Awaiting payment right now (all dates), plus any ledger entry marked pending in the range.
      pendingPayments: {
        count: pendingRows.length + ledgerPending.count,
        value: roundMoney(pendingRows.reduce((total, row) => total + parseAmount(row.totalPrice), 0) + ledgerPending.value),
      },
      refundedPayments: { count: refunded[0]?.count || 0, value: roundMoney(refunded[0]?.value || 0) },
      unverifiedBookings: { count: unverified.count, value: unverified.value, capped: unverified.capped },
      // All dates: what is set aside because of open disputes.
      disputesOpen: {
        gross: roundMoney(heldOf('payment')),
        heldFromPayees: roundMoney(
          Math.max(0, heldOf('payment') - heldOf('commission') - heldOf('gst') - heldOf('gateway_fee') - heldOf('refund'))
        ),
        commissionSetAside: roundMoney(heldOf('commission')),
      },
    });
  } catch (error) {
    console.error('Finance overview failed:', error);
    return fail('Could not load the finance overview.', 500);
  }
}
