import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok } from '@/lib/http';
import { fetchRazorpayPayment } from '@/lib/razorpay-api';
import { BookingError, cancelBooking, effectivePaymentStatus, findBooking, verifyUnverifiedBooking } from '@/lib/bookings';
import { logPaymentEvent } from '@/app/api/payment/shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/bookings/:id/resolve
 *
 * Resolves a ticket whose payment was never verified with the gateway (old
 * app versions, or LEGACY_UNVERIFIED_BOOKINGS=allow). Two ways out:
 *
 *   { action: 'verify', gatewayPaymentId, reason }   needs 'finance:manage'
 *     The server fetches that payment from Razorpay itself. Only a captured
 *     payment for exactly the booking's amount that no other booking or
 *     ledger entry uses is accepted. The booking becomes 'paid' and the
 *     ledger entries are written. Nothing the admin types is trusted.
 *
 *   { action: 'cancel', reason }                     needs 'bookings:manage'
 *     The booking is cancelled and its seats are released. Nothing was paid
 *     online, so there is no refund.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const action = asString(body?.action, 20);
  if (action !== 'verify' && action !== 'cancel') {
    const signedIn = await requireAdmin(request, 'bookings:view');
    if (!signedIn.ok) return signedIn.response;
    return fail('Unknown action', 400);
  }

  const check = await requireAdmin(request, action === 'verify' ? 'finance:manage' : 'bookings:manage');
  if (!check.ok) return check.response;
  const admin = check.admin;

  try {
    const reason = asString(body?.reason, 500);
    if (reason.length < 5) return fail('A reason of at least 5 characters is required', 400);

    const id = decodeURIComponent(params.id || '').slice(0, 80);
    const { db } = await connectToDatabase();
    const booking = await findBooking(db, id);
    if (!booking) return fail('Booking not found', 404);
    if (effectivePaymentStatus(booking) !== 'unverified') {
      return fail('The payment for this booking is not unverified, so there is nothing to resolve', 409);
    }
    const label = `${booking.eventTitle || 'Booking'} · ${booking.userPhone || ''}`;
    const before = { status: booking.status ?? null, paymentStatus: booking.paymentStatus ?? null };

    if (action === 'cancel') {
      if (booking.status === 'cancelled') return fail('This booking is already cancelled', 409);
      const result = await cancelBooking(db, booking, { requestedBy: admin.email || 'admin', reason, allowAfterStart: true });
      await logAudit({
        admin,
        action: 'resolve_unverified_cancel',
        module: 'bookings',
        entityType: 'booking',
        entityId: String(booking._id),
        entityLabel: label,
        before,
        after: { status: result.booking?.status ?? null, paymentStatus: result.booking?.paymentStatus ?? null },
        reason,
        request,
      });
      return ok({ message: 'Unverified booking cancelled and its seats released. Nothing was paid online, so there is no refund.' });
    }

    const gatewayPaymentId = asString(body?.gatewayPaymentId, 60);
    if (!/^pay_[A-Za-z0-9]{6,40}$/.test(gatewayPaymentId)) {
      return fail('Enter the Razorpay payment ID. It starts with pay_', 400);
    }

    const refuse = async (message: string, status: number) => {
      await logAudit({
        admin,
        action: 'resolve_unverified_refused',
        module: 'bookings',
        entityType: 'booking',
        entityId: String(booking._id),
        entityLabel: label,
        before,
        after: { error: message },
        reason,
        meta: { gatewayPaymentId },
        request,
      });
      return fail(message, status);
    };

    const fetched = await fetchRazorpayPayment(gatewayPaymentId);
    if (!fetched.ok || !fetched.data) {
      if (fetched.notConfigured) {
        return fail(
          'The payment gateway is not configured or is switched off, so the payment cannot be checked with Razorpay. Nothing was changed.',
          503
        );
      }
      if (fetched.status === 400 || fetched.status === 404) return refuse('Razorpay has no payment with that ID.', 404);
      return fail('The payment could not be checked with Razorpay: ' + (fetched.error || 'no answer') + ' Nothing was changed.', 502);
    }
    const payment = fetched.data;
    if (payment.id !== gatewayPaymentId) return refuse('Razorpay returned a different payment.', 409);
    if (payment.status !== 'captured') {
      return refuse(`Razorpay reports that payment as ${payment.status}, not captured. It cannot pay for this booking.`, 409);
    }

    try {
      const result = await verifyUnverifiedBooking(
        db,
        booking,
        { id: payment.id, orderId: payment.order_id, amountPaise: payment.amount, method: payment.method || null },
        admin.email || 'admin'
      );
      await logAudit({
        admin,
        action: 'resolve_unverified_verify',
        module: 'bookings',
        entityType: 'booking',
        entityId: String(booking._id),
        entityLabel: label,
        before,
        after: { status: result.booking?.status ?? null, paymentStatus: 'paid', gatewayPaymentId, ledgerReference: result.ledgerReference },
        reason,
        meta: { amount: payment.amount / 100, gatewayOrderId: payment.order_id || null },
        request,
      });
      await logPaymentEvent(db, {
        kind: 'admin_action',
        outcome: 'ok',
        message: 'Unverified booking resolved: the payment was checked with the gateway and attached',
        bookingId: String(booking._id),
        gatewayOrderId: payment.order_id || null,
        gatewayPaymentId,
        reference: result.ledgerReference,
        amount: payment.amount / 100,
        actor: admin.email || null,
      });
      return ok({
        ledgerReference: result.ledgerReference,
        message: `Payment verified with Razorpay. The booking is paid and the payment is in the ledger as ${result.ledgerReference}.`,
      });
    } catch (error) {
      if (error instanceof BookingError) return refuse(error.message, error.status);
      throw error;
    }
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, error.status, { code: error.code });
    console.error('POST /api/admin/bookings/[id]/resolve error:', error);
    return fail('Could not resolve the booking', 500);
  }
}
