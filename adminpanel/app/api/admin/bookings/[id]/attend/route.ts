import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { effectivePaymentStatus, findBooking, markCheckedIn } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/bookings/:id/attend ('bookings:manage')
 * Body: { reason? }
 *
 * Marks a confirmed booking as attended by hand, for when a ticket could not
 * be scanned at the gate. It is the same one-time check-in the scanner does.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'bookings:manage');
  if (!check.ok) return check.response;
  const admin = check.admin;

  try {
    const body = await request.json().catch(() => null);
    const reason = asString(body?.reason, 500);

    const id = decodeURIComponent(params.id || '').slice(0, 80);
    const { db } = await connectToDatabase();
    const booking = await findBooking(db, id);
    if (!booking) return fail('Booking not found', 404);

    if (booking.checkedIn === true || booking.status === 'attended') {
      return fail('This booking is already marked as attended', 409);
    }
    if (booking.status !== 'confirmed') {
      return fail('Only a confirmed booking can be marked as attended', 409);
    }
    const payment = effectivePaymentStatus(booking);
    if (payment !== 'paid' && !reason) {
      return fail('The payment for this booking is not verified. Give a reason to admit it anyway.', 400);
    }

    const result = await markCheckedIn(db, booking, admin.email || 'admin');
    if (!result.done) return fail('This booking has just changed. Please reload.', 409);

    await logAudit({
      admin,
      action: 'mark_attended',
      module: 'bookings',
      entityType: 'booking',
      entityId: String(booking._id),
      entityLabel: `${booking.eventTitle || 'Booking'} · ${booking.userPhone || ''}`,
      before: { status: booking.status ?? null, checkedIn: booking.checkedIn === true },
      after: { status: 'attended', checkedIn: true, checkedInAt: result.checkedInAt },
      reason,
      request,
      meta: { paymentStatus: payment },
    });

    return ok({ message: 'Booking marked as attended', checkedInAt: result.checkedInAt });
  } catch (error) {
    console.error('POST /api/admin/bookings/[id]/attend error:', error);
    return fail('Could not update the booking', 500);
  }
}
