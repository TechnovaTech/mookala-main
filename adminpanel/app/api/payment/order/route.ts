import { NextRequest } from 'next/server';
import { requireAppUser } from '@/lib/app-auth';
import { connectToDatabase } from '@/lib/mongodb';
import { asString, fail, ok } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import { getRazorpayConfig } from '@/lib/razorpay';
import { createRazorpayOrder } from '@/lib/razorpay-api';
import {
  BookingError,
  expireStaleHolds,
  loadBookableEvent,
  placeBooking,
  priceDraft,
  publicBooking,
  releaseBooking,
} from '@/lib/bookings';
import { logPaymentEvent } from '../shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment/order (public: website and apps)
 * Body: { userPhone, eventId, tickets: [{ category, block, fromSeat, toSeat, quantity }] }
 *
 * Prices the tickets from the event on the server, holds the seats for 15
 * minutes and creates the Razorpay order the client pays against. A free
 * event is confirmed at once with no gateway call. Nothing here ever marks a
 * booking paid: that only happens in /api/payment/verify or the webhook.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the booking as JSON', 400);

    const userPhone = asString(body.userPhone, 20);
    const eventId = asString(body.eventId, 40);
    if (!/^\+?\d{8,15}$/.test(userPhone)) return fail('A valid userPhone is required', 400, { code: 'INVALID_PHONE' });
    const gate = requireAppUser(request, userPhone);
    if (!gate.ok) return gate.response;

    const { db } = await connectToDatabase();

    const restriction = await restrictionFor(db, 'users', userPhone);
    if (restriction) return fail(restriction, 403, { code: 'ACCOUNT_RESTRICTED' });

    const event = await loadBookableEvent(db, eventId);
    await expireStaleHolds(db, { eventId });
    const draft = priceDraft(event, body.tickets);

    if (draft.totalPrice === 0) {
      const booking = await placeBooking(db, { event, userPhone, draft, mode: 'free', source: 'order' });
      return ok({
        bookingId: String(booking._id),
        free: true,
        amount: 0,
        currency: 'INR',
        booking: publicBooking(booking),
        message: 'Booking confirmed',
      });
    }

    // Checked before any seat is held, so a switched-off gateway never blocks seats.
    const config = await getRazorpayConfig();
    if (!config.isConfigured || !config.enabled) {
      return fail('Online payment is not available right now. Please try again later.', 503, {
        code: 'PAYMENTS_UNAVAILABLE',
      });
    }

    const booking = await placeBooking(db, { event, userPhone, draft, mode: 'hold', source: 'order' });
    const bookingId = String(booking._id);

    const order = await createRazorpayOrder(draft.totalPrice, bookingId, { bookingId, eventId });
    if (!order.ok || !order.data?.id) {
      // No order means the customer cannot pay: give the seats back at once.
      const now = new Date();
      await db.collection('bookings').updateOne(
        { _id: booking._id, status: 'pending_payment' },
        {
          $set: {
            status: 'expired',
            paymentStatus: 'failed',
            expiredAt: now,
            expiredReason: 'The payment gateway did not create an order',
            gatewayError: order.error,
            updatedAt: now,
          },
        }
      );
      await releaseBooking(db, booking, 'order_failed');
      await logPaymentEvent(db, {
        kind: 'order_failed',
        outcome: 'failed',
        message: 'The gateway did not create an order: ' + (order.error || 'no reason given'),
        bookingId,
        amount: draft.totalPrice,
        actor: 'customer',
        meta: { gatewayStatus: order.status, notConfigured: Boolean(order.notConfigured) },
      });
      return order.notConfigured
        ? fail('Online payment is not available right now. Please try again later.', 503, { code: 'PAYMENTS_UNAVAILABLE' })
        : fail('The payment could not be started. Please try again in a moment.', 502, { code: 'GATEWAY_ERROR' });
    }

    await db.collection('bookings').updateOne(
      { _id: booking._id },
      { $set: { gatewayOrderId: order.data.id, updatedAt: new Date() } }
    );
    await logPaymentEvent(db, {
      kind: 'order_created',
      outcome: 'ok',
      message: `Order created for ${draft.totalSeats} seat(s); seats held until ${new Date(booking.expiresAt).toISOString()}`,
      bookingId,
      gatewayOrderId: order.data.id,
      amount: draft.totalPrice,
      actor: 'customer',
    });

    return ok({
      bookingId,
      orderId: order.data.id,
      amount: order.data.amount,
      currency: order.data.currency || 'INR',
      keyId: config.keyId,
      expiresAt: booking.expiresAt,
      totalPrice: draft.totalPrice,
      totalSeats: draft.totalSeats,
      tickets: draft.lines,
    });
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, error.status, { code: error.code });
    console.error('POST /api/payment/order error:', error);
    return fail('Could not start the booking', 500);
  }
}
