import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { readBody, requireAppUser, text } from '@/lib/app-auth';
import { fail, ok, toObjectId } from '@/lib/http';
import { findBooking } from '@/lib/bookings';
import { restrictionFor } from '@/lib/user-status';
import { logAudit } from '@/lib/audit';
import { last10, phoneForms } from '@/lib/resources/support.hooks';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting for review',
  published: 'Published',
  hidden: 'Not shown publicly',
};

function attended(booking: any): boolean {
  return booking?.status === 'attended' || booking?.checkedIn === true;
}

function idOf(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * GET /api/public/feedback?phone=   (app user)
 * The ratings this customer has given, so the app can show "You rated 4/5"
 * instead of the "Rate this event" button.
 */
export async function GET(request: NextRequest) {
  const auth = requireAppUser(request, request.nextUrl.searchParams.get('phone'));
  if (!auth.ok) return auth.response;
  try {
    const { db } = await connectToDatabase();
    const rows = await db
      .collection('feedback')
      .find({ customerPhone: { $in: phoneForms(auth.phone) } }, { projection: { bookingId: 1, eventId: 1, targetName: 1, rating: 1, comment: 1, status: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    return ok({
      ratings: rows.map((r) => ({
        id: String(r._id),
        bookingId: r.bookingId || null,
        eventId: r.eventId || null,
        eventName: r.targetName || '',
        rating: Number(r.rating),
        comment: r.comment || '',
        status: r.status || 'pending',
        statusLabel: STATUS_LABEL[r.status] || STATUS_LABEL.pending,
        createdAt: r.createdAt || null,
      })),
    });
  } catch (error) {
    console.error('Public feedback list failed:', error);
    return fail('Could not load your ratings', 500);
  }
}

/**
 * POST /api/public/feedback   (app user)
 *   { phone, bookingId?, eventId?, rating (1..5), comment? }
 * Rates an event the customer attended: a booking of this phone for that event
 * whose status is 'attended' or that was checked in. One rating per booking.
 * The rating is stored as 'pending' and counts only after a moderator publishes
 * it. It is linked to the event and to its organiser and artists.
 */
export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail('Send the rating as JSON', 400);
  const auth = requireAppUser(request, body.phone);
  if (!auth.ok) return auth.response;

  const rating = typeof body.rating === 'number' ? body.rating : parseInt(String(body.rating ?? ''), 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail('Choose a rating from 1 to 5 stars.', 400);
  const comment = text(body.comment, 1000);
  const bookingId = text(body.bookingId, 80);
  const eventId = text(body.eventId, 80);
  if (!bookingId && !eventId) return fail('Say which booking or event you are rating.', 400);

  try {
    const { db } = await connectToDatabase();
    const restricted = await restrictionFor(db, 'users', auth.phone);
    if (restricted) return fail(restricted, 403);

    const phones = phoneForms(auth.phone);
    let booking: any = null;
    if (bookingId) {
      booking = await findBooking(db, bookingId);
      if (!booking || last10(booking.userPhone) !== last10(auth.phone)) return fail('That booking was not found in your bookings.', 404);
      if (eventId && idOf(booking.eventId) !== eventId) return fail('That booking is for a different event.', 400);
    } else {
      // The customer's attended bookings for the event that have no rating yet.
      const candidates = await db
        .collection('bookings')
        .find({ userPhone: { $in: phones }, eventId, $or: [{ status: 'attended' }, { checkedIn: true }] })
        .sort({ createdAt: 1 })
        .toArray();
      if (candidates.length === 0) return fail('You can rate an event after you have attended it.', 403);
      const rated = new Set(
        (await db.collection('feedback').find({ bookingId: { $in: candidates.map((c) => String(c._id)) } }, { projection: { bookingId: 1 } }).toArray()).map((f) => f.bookingId)
      );
      booking = candidates.find((c) => !rated.has(String(c._id))) || null;
      if (!booking) return fail('You have already rated this event.', 409);
    }
    if (!attended(booking)) return fail('You can rate an event after you have attended it.', 403);

    const key = String(booking._id);
    if (await db.collection('feedback').findOne({ bookingId: key }, { projection: { _id: 1 } })) {
      return fail('You have already rated this booking.', 409);
    }

    const eventOid = toObjectId(idOf(booking.eventId));
    const event = eventOid
      ? await db.collection('events').findOne({ _id: eventOid }, { projection: { name: 1, organizerId: 1, creatorRole: 1, artists: 1 } })
      : null;
    const user = await db.collection('users').findOne({ phone: { $in: phones } }, { projection: { name: 1 } });
    // Who the rating is about: the event, its organiser, and its artists (an
    // artist who created the event is stored as its organizerId with creatorRole 'artist').
    const creatorId = event?.organizerId ? String(event.organizerId) : '';
    const artistIds = new Set<string>((Array.isArray(event?.artists) ? event.artists : []).map((a: any) => String(a)).filter(Boolean));
    if (creatorId && event?.creatorRole === 'artist') artistIds.add(creatorId);
    const now = new Date();
    const doc = {
      customerName: typeof user?.name === 'string' ? user.name.trim().slice(0, 120) : '',
      customerPhone: auth.phone,
      targetType: 'event',
      targetId: idOf(booking.eventId),
      targetName: event?.name || booking.eventTitle || '',
      eventId: idOf(booking.eventId),
      bookingId: key,
      organizerId: creatorId && event?.creatorRole !== 'artist' ? creatorId : null,
      artistIds: Array.from(artistIds),
      rating,
      comment,
      status: 'pending',
      source: 'app',
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await db.collection('feedback').insertOne(doc);
    // Two requests at the same moment: keep the first rating only.
    const sameBooking = await db.collection('feedback').find({ bookingId: key }, { projection: { _id: 1 } }).sort({ _id: 1 }).toArray();
    if (sameBooking.length > 1 && String(sameBooking[0]._id) !== String(inserted.insertedId)) {
      await db.collection('feedback').deleteOne({ _id: inserted.insertedId });
      return fail('You have already rated this booking.', 409);
    }

    await logAudit({
      admin: null,
      action: 'create',
      module: 'support',
      entityType: 'feedback',
      entityId: String(inserted.insertedId),
      entityLabel: doc.customerName || 'Customer',
      after: { targetType: 'event', targetName: doc.targetName, rating, status: 'pending', source: 'app' },
      meta: { bookingId: key, tokenChecked: !auth.legacy },
      request,
    });

    return ok(
      {
        rating: { id: String(inserted.insertedId), bookingId: key, eventId: doc.eventId, rating, comment, status: 'pending', statusLabel: STATUS_LABEL.pending },
        message: 'Thank you. Your rating will appear once it has been reviewed.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Rate event failed:', error);
    return fail('Could not save your rating', 500);
  }
}
