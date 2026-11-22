import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { fetchRazorpayPayment, verifyCheckoutSignature } from '@/lib/razorpay-api';
import { BookingError, confirmPaidBooking, publicBooking } from '@/lib/bookings';
import { afterPaymentConfirmed, logPaymentEvent, recordFailedAttempt } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment/verify (public: website and apps)
 * Body: { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * Called by the client after Razorpay Checkout succeeds. The booking becomes
 * a ticket only when the signature is genuine, the order is the one created
 * for this booking and Razorpay itself reports the payment captured for the
 * exact amount. Calling it again for a confirmed booking changes nothing.
 * Every attempt, accepted or refused, is written to `paymentEvents`.
 */
export async function POST(request: NextRequest) {
  let trace: { bookingId: string; gatewayOrderId: string; gatewayPaymentId: string; amount: number | null } | null = null;
  let traceDb: Db | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the payment result as JSON', 400);

    const bookingId = asString(body.bookingId, 40);
    const orderId = asString(body.razorpay_order_id, 80);
    const paymentId = asString(body.razorpay_payment_id, 80);
    const signature = asString(body.razorpay_signature, 200);

    const oid = toObjectId(bookingId);
    if (!oid) return fail('A valid bookingId is required', 400);
    if (!orderId || !paymentId || !signature) {
      return fail('razorpay_order_id, razorpay_payment_id and razorpay_signature are required', 400);
    }

    const { db } = await connectToDatabase();
    const booking = await db.collection('bookings').findOne({ _id: oid });
    if (!booking) return fail('Booking not found', 404);

    traceDb = db;
    trace = { bookingId, gatewayOrderId: orderId, gatewayPaymentId: paymentId, amount: Number(booking.totalPrice) || null };
    const attempt = (outcome: 'ok' | 'pending' | 'refused' | 'failed', message: string, extra: Record<string, any> = {}) =>
      logPaymentEvent(db, { ...trace!, kind: 'verify_attempt', outcome, message, actor: 'customer', ...extra });

    if (!booking.gatewayOrderId || booking.gatewayOrderId !== orderId) {
      await attempt('refused', 'The order id sent does not belong to this booking');
      return fail('This payment does not belong to this booking', 400, { code: 'ORDER_MISMATCH' });
    }
    if (!(await verifyCheckoutSignature(orderId, paymentId, signature))) {
      await attempt('refused', 'The checkout signature was not valid');
      return fail('The payment signature is not valid', 400, { code: 'BAD_SIGNATURE' });
    }

    // Already a ticket: answer from the database and write nothing.
    if ((booking.status === 'confirmed' || booking.status === 'attended') && booking.gatewayPaymentId === paymentId) {
      return ok({ confirmed: true, alreadyConfirmed: true, booking: publicBooking(booking) });
    }

    const fetched = await fetchRazorpayPayment(paymentId);
    if (!fetched.ok || !fetched.data) {
      await attempt('failed', 'The payment could not be checked with the gateway: ' + (fetched.error || 'no answer'));
      return fail(
        fetched.notConfigured
          ? 'Online payment is not available right now. Your payment will be checked again shortly.'
          : 'The payment could not be checked with Razorpay. Please try again in a moment.',
        fetched.notConfigured ? 503 : 502,
        { code: 'GATEWAY_ERROR' }
      );
    }
    const payment = fetched.data;

    if (payment.order_id !== orderId) {
      await attempt('refused', 'The gateway says this payment belongs to a different order');
      return fail('This payment does not belong to this booking', 400, { code: 'ORDER_MISMATCH' });
    }

    if (payment.status === 'authorized' || payment.status === 'created') {
      // The bank has approved the payment but Razorpay has not captured it
      // yet. The seats stay held; the client asks again (or the webhook confirms).
      if (booking.status === 'pending_payment') {
        const now = new Date();
        await db.collection('bookings').updateOne(
          { _id: booking._id, status: 'pending_payment' },
          {
            $set: {
              pendingGatewayPaymentId: paymentId,
              expiresAt: new Date(now.getTime() + 30 * 60000),
              updatedAt: now,
            },
          }
        );
      }
      await attempt('pending', `The gateway reports the payment as ${payment.status}: not captured yet`);
      return ok(
        {
          confirmed: false,
          code: 'PAYMENT_PROCESSING',
          message: 'Your payment is being processed. The ticket will appear as soon as it is confirmed.',
        },
        { status: 202 }
      );
    }

    if (payment.status !== 'captured') {
      let reference: string | null = null;
      if (payment.status === 'failed') {
        // Listed under Payments -> Failed. The seats stay held until the hold
        // runs out, so the customer can try again on the same order.
        const entry = await recordFailedAttempt(db, booking, {
          id: payment.id,
          orderId: payment.order_id,
          amountPaise: payment.amount,
          method: payment.method || null,
          errorCode: payment.error_code || null,
          errorDescription: payment.error_description || null,
        });
        reference = entry?.reference || null;
      }
      await attempt('failed', `The gateway reports the payment as ${payment.status}`, { reference });
      return fail('This payment was not successful', 402, { code: 'PAYMENT_NOT_CAPTURED', paymentStatus: payment.status });
    }

    const result = await confirmPaidBooking(
      db,
      booking,
      { id: payment.id, orderId: payment.order_id, amountPaise: payment.amount, method: payment.method || null },
      'verify'
    );
    // Coupon redemption and referral rewards follow every confirmation, not only the webhook's.
    if (result.outcome === 'confirmed' || result.outcome === 'already_confirmed') {
      await afterPaymentConfirmed(db, result.booking, 'verify');
    }

    await attempt(
      result.outcome === 'late_refund' ? 'refused' : 'ok',
      result.outcome === 'confirmed'
        ? 'Payment captured: booking confirmed'
        : result.outcome === 'already_confirmed'
        ? 'Payment captured: the booking was already confirmed'
        : 'Payment captured after the seats were released: booking cancelled and a full refund requested',
      { reference: result.booking?.ledgerReference || null, amount: payment.amount / 100 }
    );

    if (result.outcome === 'late_refund') {
      return fail(
        'Your payment arrived after the seats were released and they are no longer available. A full refund has been requested.',
        409,
        { code: 'SEATS_LOST_REFUND_REQUESTED', booking: publicBooking(result.booking) }
      );
    }

    return ok({
      confirmed: true,
      alreadyConfirmed: result.outcome === 'already_confirmed',
      booking: publicBooking(result.booking),
    });
  } catch (error) {
    if (error instanceof BookingError) {
      if (trace && traceDb) {
        await logPaymentEvent(traceDb, { ...trace, kind: 'verify_attempt', outcome: 'refused', message: error.message, actor: 'customer', meta: { code: error.code } });
      }
      return fail(error.message, error.status, { code: error.code });
    }
    console.error('POST /api/payment/verify error:', error);
    return fail('Could not verify the payment', 500);
  }
}
