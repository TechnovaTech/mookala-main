import crypto from 'crypto';
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
import {
  COUPON_CODE,
  bindCouponHold,
  evaluateCoupon,
  holdCouponForBooking,
  normaliseCouponCode,
  releaseCouponHold,
  releaseOwnPendingHolds,
  settleBookingCoupon,
  settlePendingCouponBookings,
} from '@/lib/coupons';
import { afterPaymentConfirmed, logPaymentEvent } from '../shared';
import { maintenanceBlock } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment/order (public: website and apps)
 * Body: { userPhone, eventId, tickets: [{ category, block, fromSeat, toSeat, quantity }], couponCode? }
 *
 * Prices the tickets from the event on the server, holds the seats for 15
 * minutes and creates the Razorpay order the client pays against. A free
 * event is confirmed at once with no gateway call. Nothing here ever marks a
 * booking paid: that only happens in /api/payment/verify or the webhook.
 *
 * With `couponCode` the coupon is checked again here (dates, limits, the
 * 'ticketing' service, minimum amount, the customer's own limit), the gateway
 * order is created for the discounted amount, and the booking keeps
 * `listPrice` and `coupon { code, discount, couponId }`. The coupon is only
 * held for this order (lib/coupons.ts); it is redeemed when the payment is
 * confirmed, or at once when the coupon makes the booking free. Coupons are
 * funded by the platform: the payee still earns on the list price.
 */
export async function POST(request: NextRequest) {
  try {
    const down = await maintenanceBlock(); if (down) return down;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the booking as JSON', 400);

    const userPhone = asString(body.userPhone, 20);
    const eventId = asString(body.eventId, 40);
    if (!/^\+?\d{8,15}$/.test(userPhone)) return fail('A valid userPhone is required', 400, { code: 'INVALID_PHONE' });
    const gate = requireAppUser(request, userPhone);
    if (!gate.ok) return gate.response;
    const rawCoupon = body.couponCode;
    const couponCode = typeof rawCoupon === 'string' ? normaliseCouponCode(rawCoupon.slice(0, 40)) : '';
    if (rawCoupon !== undefined && rawCoupon !== null && rawCoupon !== '' && !COUPON_CODE.test(couponCode)) {
      return fail('This coupon code is not valid', 400, { code: 'COUPON_NOT_VALID' });
    }

    const { db } = await connectToDatabase();

    const restriction = await restrictionFor(db, 'users', userPhone);
    if (restriction) return fail(restriction, 403, { code: 'ACCOUNT_RESTRICTED' });

    const event = await loadBookableEvent(db, eventId);
    await expireStaleHolds(db, { eventId });
    const listDraft = priceDraft(event, body.tickets);

    let couponHit: Awaited<ReturnType<typeof evaluateCoupon>> | null = null;
    if (couponCode) {
      if (listDraft.totalPrice === 0) return fail('A coupon cannot be used on free tickets', 400, { code: 'COUPON_NOT_VALID' });
      // This customer's unfinished order for the same event is replaced below, so its hold is given back first.
      await releaseOwnPendingHolds(db, userPhone, String(event._id));
      await settlePendingCouponBookings(db, { userPhone });
      couponHit = await evaluateCoupon(db, { code: couponCode, service: 'ticketing', amount: listDraft.totalPrice, userPhone: gate.phone });
      if (!couponHit.valid) return fail(couponHit.reason || 'This coupon cannot be used', 409, { code: 'COUPON_NOT_VALID' });
    }
    const draft = couponHit ? { ...listDraft, totalPrice: couponHit.payable } : listDraft;
    const couponFields = couponHit
      ? {
          listPrice: listDraft.totalPrice,
          coupon: { code: couponHit.code, discount: couponHit.discount, couponId: String(couponHit.coupon._id), listPrice: listDraft.totalPrice },
        }
      : null;

    /** Holds the coupon under a placeholder id, places the booking, then moves the hold to it. */
    const placeWithCoupon = async (mode: 'free' | 'hold') => {
      if (!couponHit) return placeBooking(db, { event, userPhone, draft, mode, source: 'order' });
      const placeholder = 'pending:' + crypto.randomUUID();
      const held = await holdCouponForBooking(db, { coupon: couponHit.coupon, userPhone: gate.phone, bookingId: placeholder, expiresAt: null });
      if (!held.ok) throw new BookingError(held.error || 'This coupon cannot be used', 409, 'COUPON_NOT_VALID');
      let booking: any;
      try {
        booking = await placeBooking(db, { event, userPhone, draft, mode, source: 'order' });
      } catch (error) {
        await releaseCouponHold(db, placeholder);
        throw error;
      }
      await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { ...couponFields, updatedAt: new Date() } });
      await bindCouponHold(db, placeholder, String(booking._id), booking.expiresAt || null);
      return { ...booking, ...couponFields };
    };

    if (draft.totalPrice === 0) {
      const booking = await placeWithCoupon('free');
      if (couponHit) {
        // A free booking is placed and paid for at once: the coupon is redeemed now.
        await settleBookingCoupon(db, booking, 'free_booking');
        await afterPaymentConfirmed(db, booking, 'free_booking');
      }
      const saved = (await db.collection('bookings').findOne({ _id: booking._id })) || booking;
      return ok({
        bookingId: String(booking._id),
        free: true,
        amount: 0,
        currency: 'INR',
        listPrice: listDraft.totalPrice,
        discount: couponHit ? couponHit.discount : 0,
        couponCode: couponHit ? couponHit.code : null,
        booking: publicBooking(saved),
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

    const booking = await placeWithCoupon('hold');
    const bookingId = String(booking._id);

    const order = await createRazorpayOrder(draft.totalPrice, bookingId, { bookingId, eventId });
    if (!order.ok || !order.data?.id) {
      if (couponHit) await releaseCouponHold(db, bookingId);
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
      message:
        `Order created for ${draft.totalSeats} seat(s); seats held until ${new Date(booking.expiresAt).toISOString()}` +
        (couponHit ? `; coupon ${couponHit.code} takes ₹${couponHit.discount} off the list price of ₹${listDraft.totalPrice}` : ''),
      bookingId,
      gatewayOrderId: order.data.id,
      amount: draft.totalPrice,
      actor: 'customer',
      meta: couponHit ? { couponCode: couponHit.code, discount: couponHit.discount, listPrice: listDraft.totalPrice } : undefined,
    });

    return ok({
      bookingId,
      orderId: order.data.id,
      amount: order.data.amount,
      currency: order.data.currency || 'INR',
      keyId: config.keyId,
      expiresAt: booking.expiresAt,
      totalPrice: draft.totalPrice,
      listPrice: listDraft.totalPrice,
      discount: couponHit ? couponHit.discount : 0,
      couponCode: couponHit ? couponHit.code : null,
      totalSeats: draft.totalSeats,
      tickets: draft.lines,
    });
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, error.status, { code: error.code });
    console.error('POST /api/payment/order error:', error);
    return fail('Could not start the booking', 500);
  }
}
