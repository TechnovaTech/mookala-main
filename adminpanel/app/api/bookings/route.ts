import { NextRequest } from 'next/server';
import { requireAppUser } from '@/lib/app-auth';
import { isAdminWith } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { asString, fail, ok } from '@/lib/http';
import { restrictionFor } from '@/lib/user-status';
import {
  BookingError,
  expireStaleHolds,
  legacyUnverifiedAllowed,
  loadBookableEvent,
  placeBooking,
  priceDraft,
  publicBooking,
} from '@/lib/bookings';
import { maintenanceBlock } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookings
 *   ?userPhone=       a customer's bookings (user app, website)
 *   ?organizerPhone=  bookings for an organiser's or artist's own events
 *   ?eventId= / ?eventTitle=
 * With no filter at all it lists every booking and therefore needs an admin
 * with 'bookings:view'.
 *
 * Bookings that never became tickets (awaiting payment, expired) are left out
 * unless `includePending=1` is passed, so installed app versions do not show
 * them as tickets.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userPhone = asString(searchParams.get('userPhone'), 30);
    const organizerPhone = asString(searchParams.get('organizerPhone'), 30);
    const eventTitle = asString(searchParams.get('eventTitle'), 300);
    const eventId = asString(searchParams.get('eventId'), 300);
    const includePending = searchParams.get('includePending') === '1';

    const filtered = Boolean(userPhone || organizerPhone || eventTitle || eventId);
    if (!filtered) {
      const check = await requireAdmin(request, 'bookings:view');
      if (!check.ok) return check.response;
    }

    // A customer or organiser may only list their own bookings. An admin with
    // the bookings permission may list anyone's.
    const ownerPhone = userPhone || organizerPhone;
    if (!isAdminWith(request, 'bookings:view')) {
      if (ownerPhone) {
        const gate = requireAppUser(request, ownerPhone);
        if (!gate.ok) return gate.response;
      } else if (filtered) {
        // An event's bookings carry customers' phone numbers, so a filter by
        // event alone is for admins. Organisers pass their own phone as well.
        const check = await requireAdmin(request, 'bookings:view');
        if (!check.ok) return check.response;
      }
    }

    const { db } = await connectToDatabase();
    const query: Record<string, any> = {};
    if (userPhone) query.userPhone = userPhone;
    if (eventId) query.eventId = eventId;
    if (eventTitle) query.eventTitle = eventTitle;

    // An organiser (or an artist who created events) only sees bookings for
    // their own events.
    if (organizerPhone) {
      const [organizer, artist] = await Promise.all([
        db.collection('organizers').findOne({ phone: organizerPhone }, { projection: { _id: 1 } }),
        db.collection('artists').findOne({ phone: organizerPhone }, { projection: { _id: 1 } }),
      ]);
      const creatorIds = [organizer?._id, artist?._id].filter(Boolean);
      if (creatorIds.length === 0) return ok({ bookings: [] });

      const events = await db
        .collection('events')
        .find({ organizerId: { $in: creatorIds } })
        .project({ _id: 1, name: 1 })
        .toArray();
      if (events.length === 0) return ok({ bookings: [] });

      // Bookings reference their event by id, but older rows carry the title.
      query.$or = [
        { eventId: { $in: events.map((event) => event._id.toString()) } },
        { eventTitle: { $in: events.map((event) => event.name).filter(Boolean) } },
      ];
    }

    // No scheduler runs on the host: holds that ran out are expired on read.
    if (eventId) await expireStaleHolds(db, { eventId });
    else if (userPhone) await expireStaleHolds(db, { userPhone });
    else await expireStaleHolds(db);

    if (filtered && !includePending) query.status = { $nin: ['pending_payment', 'expired'] };

    const bookings = await db.collection('bookings').find(query).sort({ bookingDate: -1 }).limit(5000).toArray();
    return ok({ bookings: bookings.map(publicBooking) });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return fail('Failed to fetch bookings', 500);
  }
}

/**
 * POST /api/bookings (the route the installed apps and the website call)
 *
 * This route used to store whatever the client sent, including a made-up
 * payment id and `paymentStatus: 'paid'`. It now prices and validates on the
 * server exactly like /api/payment/order and ignores the client's `status`,
 * `paymentStatus`, `totalPrice`, prices and `_id`.
 *
 *  - Free event: the booking is confirmed.
 *  - Paid event: no ticket is issued. The attempt is recorded as
 *    'pending_payment' / 'unverified' (holding no seats) and the answer is
 *    402 PAYMENT_REQUIRED, because this route cannot take a payment.
 *  - Demonstrations only: with LEGACY_UNVERIFIED_BOOKINGS=allow the booking
 *    is confirmed with paymentStatus 'unverified'. It is never 'paid' and
 *    nothing is written to the ledger.
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

    const { db } = await connectToDatabase();

    const restriction = await restrictionFor(db, 'users', userPhone);
    if (restriction) return fail(restriction, 403, { code: 'ACCOUNT_RESTRICTED' });

    const event = await loadBookableEvent(db, eventId);
    await expireStaleHolds(db, { eventId });
    const draft = priceDraft(event, body.tickets);
    const clientPaymentId = asString(body.paymentId, 120) || undefined;

    if (draft.totalPrice === 0) {
      const booking = await placeBooking(db, { event, userPhone, draft, mode: 'free', source: 'legacy' });
      return ok({ bookingId: booking._id, booking: publicBooking(booking), message: 'Booking created successfully' });
    }

    if (legacyUnverifiedAllowed()) {
      const booking = await placeBooking(db, {
        event,
        userPhone,
        draft,
        mode: 'legacy_demo',
        source: 'legacy',
        clientPaymentId,
      });
      return ok({
        bookingId: booking._id,
        booking: publicBooking(booking),
        paymentStatus: 'unverified',
        message: 'Booking created without a verified payment (demonstration mode)',
      });
    }

    const booking = await placeBooking(db, {
      event,
      userPhone,
      draft,
      mode: 'legacy_unpaid',
      source: 'legacy',
      clientPaymentId,
    });
    return fail(
      'This version of the app cannot take payments. Please update Mookalaa to the latest version to book this event.',
      402,
      { code: 'PAYMENT_REQUIRED', bookingId: booking._id, amount: draft.totalPrice }
    );
  } catch (error) {
    if (error instanceof BookingError) return fail(error.message, error.status, { code: error.code });
    console.error('Error creating booking:', error);
    return fail('Failed to create booking', 500);
  }
}
