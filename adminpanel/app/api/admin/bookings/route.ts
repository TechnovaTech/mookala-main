import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { asString, csvResponse, escapeRegex, fail, ok, toCsv, toObjectId } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { effectivePaymentStatus, expireStaleHolds, unverifiedTicketTotals, BOOKING_STATUSES, PAYMENT_STATUSES } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

function seatsText(tickets: any): string {
  if (!Array.isArray(tickets)) return '';
  return tickets
    .map((t) => {
      const name = [t?.category, t?.block].filter(Boolean).join(' / ');
      const seats = t?.fromSeat != null && t?.toSeat != null ? ` ${t.fromSeat}-${t.toSeat}` : '';
      return `${name}${seats} x${t?.quantity ?? ''}`;
    })
    .join('; ');
}

function dayStart(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Admin dates are India dates.
  const date = new Date(value + 'T00:00:00+05:30');
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * GET /api/admin/bookings ('bookings:view')
 *   q            event title, phone, booking id, payment id or order id
 *   status       pending_payment | confirmed | attended | cancelled | expired
 *   paymentStatus
 *   eventId
 *   from, to     booking date range (YYYY-MM-DD, India time, inclusive)
 *   page, limit
 *   format=csv   download of everything that matches (up to 10,000 rows)
 *   withEvents=1 also returns the events that have bookings, for the filter
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'bookings:view');
  if (!check.ok) return check.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = asString(searchParams.get('q'), 120);
    const status = asString(searchParams.get('status'), 30);
    const paymentStatus = asString(searchParams.get('paymentStatus'), 30);
    const eventId = asString(searchParams.get('eventId'), 300);
    const from = asString(searchParams.get('from'), 10);
    const to = asString(searchParams.get('to'), 10);
    const format = asString(searchParams.get('format'), 10);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10) || 25));

    if (status && !(BOOKING_STATUSES as readonly string[]).includes(status)) return fail('Unknown status filter', 400);
    if (paymentStatus && !(PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)) {
      return fail('Unknown payment status filter', 400);
    }

    const and: Record<string, any>[] = [];
    if (eventId) and.push({ eventId });
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) {
        const start = dayStart(from);
        if (!start) return fail('The "from" date must be YYYY-MM-DD', 400);
        range.$gte = start;
      }
      if (to) {
        const end = dayStart(to);
        if (!end) return fail('The "to" date must be YYYY-MM-DD', 400);
        range.$lt = new Date(end.getTime() + 24 * 3600000);
      }
      and.push({ createdAt: range });
    }
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      const or: Record<string, any>[] = [
        { eventTitle: pattern },
        { userPhone: pattern },
        { paymentId: pattern },
        { gatewayPaymentId: pattern },
        { gatewayOrderId: pattern },
        { _id: pattern }, // old rows whose _id is text
      ];
      const oid = toObjectId(q);
      if (oid) or.push({ _id: oid });
      and.push({ $or: or });
    }
    if (paymentStatus === 'paid') {
      // 'paid' means verified with the gateway, or nothing was owed.
      and.push({ paymentStatus: 'paid' });
      and.push({ $or: [{ gatewayPaymentId: { $type: 'string' } }, { isFree: true }, { totalPrice: 0 }] });
    } else if (paymentStatus === 'unverified') {
      and.push({
        $or: [
          { paymentStatus: 'unverified' },
          { paymentStatus: { $exists: false } },
          { paymentStatus: 'paid', gatewayPaymentId: { $not: { $type: 'string' } }, isFree: { $ne: true }, totalPrice: { $ne: 0 } },
        ],
      });
    } else if (paymentStatus) {
      and.push({ paymentStatus });
    }

    const { db } = await connectToDatabase();
    await expireStaleHolds(db, eventId ? { eventId } : {});

    const base = and.length ? { $and: and } : {};
    const filter = status ? { $and: [...and, { status }] } : base;
    const collection = db.collection('bookings');

    const present = (booking: any) => ({
      ...booking,
      _id: String(booking._id),
      paymentStatus: effectivePaymentStatus(booking),
      storedPaymentStatus: booking.paymentStatus ?? null,
    });

    if (format === 'csv') {
      const rows = await collection.find(filter).sort({ createdAt: -1 }).limit(10000).toArray();
      const csv = toCsv(
        rows.map((b) => {
          const p = present(b);
          return { ...p, seats: seatsText(b.tickets), checkedIn: b.checkedIn === true ? 'yes' : 'no' };
        }),
        [
          { key: '_id', label: 'Booking ID' },
          { key: 'createdAt', label: 'Booked at' },
          { key: 'eventTitle', label: 'Event' },
          { key: 'eventDate', label: 'Event date' },
          { key: 'eventTime', label: 'Event time' },
          { key: 'venue', label: 'Venue' },
          { key: 'userPhone', label: 'Customer phone' },
          { key: 'seats', label: 'Tickets' },
          { key: 'totalSeats', label: 'Seats' },
          { key: 'totalPrice', label: 'Total (INR)' },
          { key: 'amountPaid', label: 'Paid online (INR)' },
          { key: 'status', label: 'Status' },
          { key: 'paymentStatus', label: 'Payment status' },
          { key: 'gatewayOrderId', label: 'Razorpay order' },
          { key: 'gatewayPaymentId', label: 'Razorpay payment' },
          { key: 'checkedIn', label: 'Checked in' },
          { key: 'checkedInAt', label: 'Checked in at' },
          { key: 'cancelledAt', label: 'Cancelled at' },
          { key: 'cancelledBy', label: 'Cancelled by' },
          { key: 'cancelReason', label: 'Cancel reason' },
        ]
      );
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'bookings',
        entityType: 'bookings',
        entityLabel: 'Bookings',
        meta: { q: q || null, status: status || null, paymentStatus: paymentStatus || null, eventId: eventId || null, from: from || null, to: to || null, rows: rows.length },
        request,
      });
      return csvResponse(csv, `bookings-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    const [items, total, grouped, unverified] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
      // Counts per status for everything that matches the other filters.
      collection.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      // Tickets issued without a verified payment, whatever the filters: never revenue.
      unverifiedTicketTotals(db),
    ]);

    const counts: Record<string, number> = { all: 0, other: 0 };
    for (const s of BOOKING_STATUSES) counts[s] = 0;
    for (const row of grouped) {
      const key = typeof row._id === 'string' && row._id in counts ? row._id : 'other';
      counts[key] += row.count;
      counts.all += row.count;
    }

    // Refund state for cancelled bookings on this page.
    const refundIds = items.map((b) => String(b._id));
    const refunds = refundIds.length
      ? await db
          .collection('refunds')
          .find({ bookingId: { $in: refundIds } })
          .project({ bookingId: 1, status: 1, refundAmount: 1, deductionAmount: 1, refundPercent: 1, ruleSnapshot: 1 })
          .toArray()
      : [];
    const refundByBooking = new Map(refunds.map((r) => [String(r.bookingId), { ...r, _id: String(r._id) }]));

    const data: Record<string, any> = {
      items: items.map((b) => ({ ...present(b), refund: refundByBooking.get(String(b._id)) || null })),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts,
      unverified,
    };

    if (searchParams.get('withEvents') === '1') {
      const events = await collection
        .aggregate([
          { $match: { eventId: { $type: 'string', $ne: '' } } },
          { $group: { _id: '$eventId', title: { $last: '$eventTitle' }, bookings: { $sum: 1 } } },
          { $sort: { title: 1 } },
          { $limit: 500 },
        ])
        .toArray();
      data.events = events.map((e) => ({ id: String(e._id), title: e.title || String(e._id), bookings: e.bookings }));
    }

    return ok(data);
  } catch (error) {
    console.error('GET /api/admin/bookings error:', error);
    return fail('Could not load bookings', 500);
  }
}
