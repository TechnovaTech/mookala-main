import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { BookingError, cancelBooking, findBooking } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/bookings/:id/cancel ('bookings:manage')
 * Body: { reason }
 *
 * The same cancellation the customer can make: the seats are given back and,
 * when the refund rule in force grants one, a refund request is opened with
 * `requestedBy` set to this admin. Approving and paying it happens in
 * Finance -> Refunds.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'bookings:manage');
  if (!check.ok) return check.response;
  const admin = check.admin;

  try {
    const body = await request.json().catch(() => null);
    const reason = asString(body?.reason, 500);
    if (!reason) return fail('A reason is required to cancel a booking', 400);

    const id = decodeURIComponent(params.id || '').slice(0, 80);
    const { db } = await connectToDatabase();
    const booking = await findBooking(db, id);
    if (!booking) return fail('Booking not found', 404);
    if (booking.status === 'cancelled') return fail('This booking is already cancelled', 409);

    const result = await cancelBooking(db, booking, {
      requestedBy: admin.email || 'admin',
      reason,
      allowAfterStart: true,
    });

    await logAudit({
      admin,
      action: 'cancel',
      module: 'bookings',
      entityType: 'booking',
      entityId: String(booking._id),
      entityLabel: `${booking.eventTitle || 'Booking'} · ${booking.userPhone || ''}`,
      before: { status: booking.status ?? null, paymentStatus: booking.paymentStatus ?? null },
      after: {
        status: result.booking?.status ?? null,
        paymentStatus: result.booking?.paymentStatus ?? null,
        refundId: result.refund ? String(result.refund._id) : null,
        refundAmount: result.quote.refundAmount,
        deductionAmount: result.quote.deductionAmount,
        ruleName: result.quote.ruleName,
      },
      reason,
      request,
    });

    return ok({
      booking: result.booking ? { ...result.booking, _id: String(result.booking._id) } : null,
      quote: result.quote,
      refund: result.refund ? { ...result.refund, _id: String(result.refund._id) } : null,
      message: result.refund
        ? 'Booking cancelled. A refund request was opened in Finance -> Refunds.'
        : 'Booking cancelled. ' + result.quote.explanation,
    });
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, error.status, { code: error.code });
    console.error('POST /api/admin/bookings/[id]/cancel error:', error);
    return fail('Could not cancel the booking', 500);
  }
}
