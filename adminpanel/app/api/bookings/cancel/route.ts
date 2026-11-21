import { NextRequest } from 'next/server';
import { requireAppUser } from '@/lib/app-auth';
import { connectToDatabase } from '@/lib/mongodb';
import { asString, fail, ok } from '@/lib/http';
import { BookingError, cancelBooking, findBooking, publicBooking, quoteCancellation } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/cancel (public: website and apps)
 * Body: { bookingId, userPhone, reason, preview? }
 *
 * The phone must be the one the booking was made with. With `preview: true`
 * nothing is changed: the answer is the refund the customer would get under
 * the rule in force right now, so the app can show it before they confirm.
 *
 * Confirming cancels the booking, gives the seats back and opens a refund
 * request for the finance team when a refund is due. No money is moved here.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the request as JSON', 400);

    const bookingId = asString(body.bookingId, 80);
    const userPhone = asString(body.userPhone, 20);
    const reason = asString(body.reason, 500);
    const preview = body.preview === true;
    if (!bookingId || !userPhone) return fail('bookingId and userPhone are required', 400);
    const gate = requireAppUser(request, userPhone);
    if (!gate.ok) return gate.response;

    const { db } = await connectToDatabase();
    const booking = await findBooking(db, bookingId);
    // The same answer for "no such booking" and "not your booking".
    if (!booking || typeof booking.userPhone !== 'string' || booking.userPhone !== userPhone) {
      return fail('Booking not found', 404);
    }

    if (preview) {
      const quote = await quoteCancellation(db, booking);
      const cancellable =
        (booking.status === 'confirmed' || booking.status === 'pending_payment') &&
        booking.checkedIn !== true &&
        !(quote.hoursBeforeEvent !== null && quote.hoursBeforeEvent < 0);
      return ok({ preview: true, cancellable, status: booking.status || '', quote });
    }

    if (!reason) return fail('Please give a reason for the cancellation', 400);

    const result = await cancelBooking(db, booking, { requestedBy: 'customer', reason });
    return ok({
      cancelled: true,
      alreadyCancelled: result.alreadyCancelled,
      booking: publicBooking(result.booking),
      quote: result.quote,
      refund: result.refund
        ? {
            id: String(result.refund._id),
            status: result.refund.status,
            refundAmount: result.refund.refundAmount,
            deductionAmount: result.refund.deductionAmount,
          }
        : null,
      message: result.refund
        ? 'Booking cancelled. Your refund request has been sent for approval.'
        : 'Booking cancelled. ' + result.quote.explanation,
    });
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, error.status, { code: error.code });
    console.error('POST /api/bookings/cancel error:', error);
    return fail('Could not cancel the booking', 500);
  }
}
