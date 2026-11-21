import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { fail, ok, parseAmount, toObjectId } from '@/lib/http';
import { roundMoney } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

/**
 * Money for one event. Admin only ('finance:view', enforced by the middleware).
 *
 * Three separate things are returned and must not be confused:
 *   - `tickets` / `ticketsSold`: the ticket inventory kept on the event;
 *   - `ledger`: money actually received and verified with the gateway;
 *   - `bookings`: what the bookings say, including how much was never verified.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const oid = toObjectId(params.id);
  if (!oid) return fail('Invalid event ID', 400);

  try {
    const { db } = await connectToDatabase();
    const event = await db.collection('events').findOne(
      { _id: oid },
      {
        projection: {
          name: 1,
          status: 1,
          startDate: 1,
          startTime: 1,
          endDate: 1,
          location: 1,
          organizerId: 1,
          creatorRole: 1,
          tickets: 1,
        },
      }
    );
    if (!event) return fail('Event not found', 404);

    let totalTickets = 0;
    let ticketsSold = 0;
    let inventoryValue = 0;

    const tickets = (Array.isArray(event.tickets) ? event.tickets : []).map((ticket: any) => {
      const quantity = parseInt(String(ticket?.quantity ?? 0), 10) || 0;
      const sold = parseInt(String(ticket?.sold ?? 0), 10) || 0;
      const price = parseAmount(ticket?.price);
      totalTickets += quantity;
      ticketsSold += sold;
      inventoryValue += sold * price;
      return {
        name: ticket?.name || ticket?.blockName || null,
        blockName: ticket?.blockName || null,
        price,
        quantity,
        sold,
        // Value of the tickets marked sold at the listed price. Not money received.
        revenue: roundMoney(sold * price),
        soldPercent: quantity > 0 ? Math.round((sold / quantity) * 1000) / 10 : null,
      };
    });

    const eventIds = [params.id, oid];

    const [ledgerRows, bookingRows] = await Promise.all([
      db
        .collection('transactions')
        .aggregate([
          { $match: { eventId: { $in: eventIds }, status: 'success' } },
          {
            $group: {
              _id: { $cond: [{ $eq: ['$payeeType', 'platform'] }, { $concat: ['platform_', '$type'] }, '$type'] },
              total: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
      db
        .collection('bookings')
        .find({ eventId: { $in: eventIds } }, { projection: { totalPrice: 1, amountPaid: 1, paymentStatus: 1, status: 1, totalSeats: 1 } })
        .limit(50000)
        .toArray(),
    ]);

    const by = Object.fromEntries(ledgerRows.map((r) => [String(r._id), { total: Number(r.total) || 0, count: r.count as number }]));
    const sum = (type: string) => roundMoney(by[type]?.total || 0);
    const ledger = {
      payments: by.payment?.count || 0,
      gross: sum('payment'),
      commission: sum('commission'),
      gst: sum('gst'),
      gatewayFee: sum('gateway_fee'),
      // Refunds of payments that are in the ledger; these reduce what the organiser is owed.
      refunds: sum('refund'),
      refundDeductions: sum('refund_deduction'),
      // Refunds of bookings that were never verified with the gateway. The
      // organiser was never credited for those, so they do not reduce the net.
      refundsOutsideLedger: sum('platform_refund'),
      net: roundMoney(sum('payment') - sum('commission') - sum('gst') - sum('gateway_fee') - sum('refund')),
    };

    const byPaymentStatus: Record<string, { count: number; amount: number }> = {};
    let bookingAmount = 0;
    let seats = 0;
    for (const booking of bookingRows) {
      const key = String(booking.paymentStatus || 'unknown');
      const amount = typeof booking.amountPaid === 'number' && booking.amountPaid > 0 ? booking.amountPaid : parseAmount(booking.totalPrice);
      byPaymentStatus[key] = byPaymentStatus[key] || { count: 0, amount: 0 };
      byPaymentStatus[key].count += 1;
      byPaymentStatus[key].amount = roundMoney(byPaymentStatus[key].amount + amount);
      bookingAmount += amount;
      seats += parseInt(String(booking.totalSeats ?? 0), 10) || 0;
    }
    const unverified = byPaymentStatus.unverified || { count: 0, amount: 0 };

    const eventDetails = {
      eventId: params.id,
      eventName: event.name || null,
      status: event.status || null,
      startDate: event.startDate || null,
      startTime: event.startTime || null,
      city: event.location?.city || null,
      organizerId: event.organizerId ? String(event.organizerId) : null,
      creatorRole: event.creatorRole || 'organizer',
      totalTickets,
      ticketsSold,
      soldPercent: totalTickets > 0 ? Math.round((ticketsSold / totalTickets) * 1000) / 10 : null,
      // Kept for older callers: value of tickets marked sold, formatted. Use `ledger.gross` for money received.
      totalRevenue: roundMoney(inventoryValue).toLocaleString('en-IN'),
      inventoryValue: roundMoney(inventoryValue),
      tickets,
      ledger,
      bookings: {
        total: bookingRows.length,
        seats,
        amount: roundMoney(bookingAmount),
        unverifiedCount: unverified.count,
        unverifiedAmount: unverified.amount,
        unverifiedPercent: bookingRows.length > 0 ? Math.round((unverified.count / bookingRows.length) * 1000) / 10 : null,
        byPaymentStatus,
      },
    };

    return ok({ eventDetails });
  } catch (error) {
    console.error('Error fetching event payment details:', error);
    return fail('Failed to fetch payment details', 500);
  }
}
