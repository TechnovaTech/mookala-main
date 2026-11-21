import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { fail, ok } from '@/lib/http';
import { effectivePaymentStatus, expireStaleHolds, findBooking, findEvent, quoteCancellation } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/bookings/:id ('bookings:view')
 * One booking with everything recorded about it: ledger entries (only for an
 * admin with 'finance:view', otherwise `ledger: null`), the refund request,
 * the activity log, and what a cancellation would refund right now.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'bookings:view');
  if (!check.ok) return check.response;

  try {
    const id = decodeURIComponent(params.id || '').slice(0, 80);
    if (!id) return fail('A booking id is required', 400);

    const { db } = await connectToDatabase();
    let booking = await findBooking(db, id);
    if (!booking) return fail('Booking not found', 404);

    if (booking.status === 'pending_payment' && typeof booking.eventId === 'string') {
      await expireStaleHolds(db, { eventId: booking.eventId });
      booking = (await db.collection('bookings').findOne({ _id: booking._id })) || booking;
    }

    const key = String(booking._id);
    // Ledger entries (commission, GST, gateway charge, payee lines) are finance
    // records: only an admin who may view Finance receives them.
    const showLedger = can(check.admin, 'finance:view');
    const [ledger, refund, history, event] = await Promise.all([
      showLedger
        ? db.collection('transactions').find({ bookingId: key }).sort({ createdAt: 1 }).limit(200).toArray()
        : Promise.resolve(null),
      db.collection('refunds').findOne({ bookingId: key }),
      db
        .collection('auditLogs')
        .find({ entityType: 'booking', entityId: key })
        .sort({ createdAt: -1 })
        .limit(100)
        .project({ adminName: 1, adminEmail: 1, action: 1, reason: 1, before: 1, after: 1, createdAt: 1 })
        .toArray(),
      findEvent(db, booking.eventId),
    ]);

    const cancellable = (booking.status === 'confirmed' || booking.status === 'pending_payment') && booking.checkedIn !== true;

    return ok({
      booking: {
        ...booking,
        _id: key,
        paymentStatus: effectivePaymentStatus(booking),
        storedPaymentStatus: booking.paymentStatus ?? null,
      },
      // The ticket QR in the apps is JSON that carries the booking id.
      qrPayload: JSON.stringify({ bookingId: key }),
      event: event
        ? { id: String(event._id), name: event.name || '', status: event.status || '', startDate: event.startDate || '', startTime: event.startTime || '' }
        : null,
      // null (not an empty list) when the admin may not see finance records.
      ledger: ledger ? ledger.map((entry) => ({ ...entry, _id: String(entry._id) })) : null,
      refund: refund ? { ...refund, _id: String(refund._id) } : null,
      history: history.map((entry) => ({ ...entry, _id: String(entry._id) })),
      cancellable,
      cancelQuote: cancellable ? await quoteCancellation(db, booking) : null,
    });
  } catch (error) {
    console.error('GET /api/admin/bookings/[id] error:', error);
    return fail('Could not load the booking', 500);
  }
}
