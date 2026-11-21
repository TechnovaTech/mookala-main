import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { parseEventDateTime } from '@/lib/bookings';
import { asString, fail, ok, parseAmount, toObjectId } from '@/lib/http';
import {
  bookingStatsForEvent,
  eventIdMatch,
  mergeTickets,
  seatsOf,
  staffNames,
  summariseTickets,
  ticketCount,
  ticketKey,
} from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'rejected'];
const PERSON = { name: 1, phone: 1, email: 1, city: 1, kycStatus: 1, profileImage: 1, genre: 1 };

/**
 * An organiser or artist on the event. Their phone number and email are kept
 * only when the admin may view that person's module (`contact`).
 */
function person(doc: any, role: string, contact: boolean) {
  if (!doc) return null;
  return {
    _id: String(doc._id),
    role,
    name: doc.name || '',
    phone: contact ? doc.phone || '' : '',
    email: contact ? doc.email || '' : '',
    contactHidden: !contact,
    city: doc.city || '',
    genre: doc.genre || '',
    kycStatus: doc.kycStatus || null,
    profileImage: doc.profileImage || null,
  };
}

/* ------------------------------------------------------------------ */
/* Sales monitor                                                       */
/* ------------------------------------------------------------------ */

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const HOLDING = ['confirmed', 'attended', 'pending_payment'];

/**
 * What customers did on this event, read from `bookings` and `refunds`:
 *   sold        confirmed and attended bookings
 *   checkedIn   bookings scanned at the gate
 *   cancelled   cancelled bookings
 *   refunds     refund requests by state; `processed` is money actually returned
 * plus, per ticket category, the seats on live bookings next to the `sold`
 * counter stored on the event, so a difference between the two is visible.
 */
async function salesFor(db: any, id: any, tickets: ReturnType<typeof summariseTickets>) {
  const [bookings, refunds] = await Promise.all([
    db
      .collection('bookings')
      .find(
        { eventId: eventIdMatch(id) },
        {
          projection: {
            userPhone: 1,
            status: 1,
            paymentStatus: 1,
            totalSeats: 1,
            totalPrice: 1,
            amountPaid: 1,
            tickets: 1,
            checkedIn: 1,
            checkedInAt: 1,
            cancelledAt: 1,
            cancelReason: 1,
            cancelledBy: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .limit(20000)
      .toArray(),
    db
      .collection('refunds')
      .find({ eventId: eventIdMatch(id) }, { projection: { status: 1, refundAmount: 1, deductionAmount: 1, amountPaid: 1, bookingId: 1, processedAt: 1, createdAt: 1 } })
      .limit(20000)
      .toArray(),
  ]);

  const bucket = () => ({ bookings: 0, seats: 0, value: 0 });
  const sold = bucket();
  const checkedIn = bucket();
  const cancelled = bucket();
  const awaitingPayment = bucket();
  const expired = bucket();
  const other = bucket();
  const byStatus: Record<string, number> = {};
  const byPayment: Record<string, number> = {};
  const liveSeats = new Map<string, number>();

  for (const booking of bookings) {
    const seats = seatsOf(booking);
    const value = parseAmount(booking.totalPrice);
    const status = String(booking.status || 'unknown');
    byStatus[status] = (byStatus[status] || 0) + 1;
    const payment = String(booking.paymentStatus || 'unknown');
    byPayment[payment] = (byPayment[payment] || 0) + 1;

    const target =
      status === 'confirmed' || status === 'attended'
        ? sold
        : status === 'cancelled'
        ? cancelled
        : status === 'pending_payment'
        ? awaitingPayment
        : status === 'expired'
        ? expired
        : other;
    target.bookings += 1;
    target.seats += seats;
    target.value += value;

    if (booking.checkedIn === true) {
      checkedIn.bookings += 1;
      checkedIn.seats += seats;
      checkedIn.value += value;
    }

    if (HOLDING.includes(status) && Array.isArray(booking.tickets)) {
      for (const line of booking.tickets) {
        const key = ticketKey({ name: line?.category, blockName: line?.block });
        liveSeats.set(key, (liveSeats.get(key) || 0) + ticketCount(line?.quantity));
      }
    }
  }
  for (const entry of [sold, checkedIn, cancelled, awaitingPayment, expired, other]) entry.value = money(entry.value);

  const refundStates: Record<string, { count: number; amount: number }> = {};
  let refundedAmount = 0;
  let refundedCount = 0;
  let deductions = 0;
  let openAmount = 0;
  let openCount = 0;
  for (const refund of refunds) {
    const status = String(refund.status || 'requested');
    const amount = parseAmount(refund.refundAmount);
    refundStates[status] = refundStates[status] || { count: 0, amount: 0 };
    refundStates[status].count += 1;
    refundStates[status].amount = money(refundStates[status].amount + amount);
    if (status === 'processed') {
      refundedCount += 1;
      refundedAmount += amount;
      deductions += parseAmount(refund.deductionAmount);
    } else if (['requested', 'awaiting_second_approval', 'approved', 'processing'].includes(status)) {
      openCount += 1;
      openAmount += amount;
    }
  }

  const inventory = tickets.map((ticket) => {
    const exact = liveSeats.get(ticketKey(ticket));
    // Older bookings carry the category without the block name.
    const loose = exact === undefined ? liveSeats.get(ticketKey({ name: ticket.name, blockName: '' })) : exact;
    const booked = loose || 0;
    return { name: ticket.name, blockName: ticket.blockName, counter: ticket.sold, booked, difference: ticket.sold - booked };
  });

  return {
    sold,
    checkedIn,
    cancelled,
    awaitingPayment,
    expired,
    other,
    byStatus,
    byPayment,
    refunds: {
      total: refunds.length,
      processed: { count: refundedCount, amount: money(refundedAmount), deductions: money(deductions) },
      open: { count: openCount, amount: money(openAmount) },
      states: refundStates,
    },
    inventory,
    recent: bookings.slice(0, 15).map((booking: any) => ({
      _id: String(booking._id),
      userPhone: booking.userPhone || '',
      status: booking.status || '',
      paymentStatus: booking.paymentStatus || '',
      seats: seatsOf(booking),
      totalPrice: parseAmount(booking.totalPrice),
      checkedIn: booking.checkedIn === true,
      cancelledAt: booking.cancelledAt || null,
      cancelReason: booking.cancelReason || '',
      createdAt: booking.createdAt || null,
    })),
  };
}

/**
 * GET /api/admin/events/[id]: one event for the admin detail screen, with its
 * creator (organiser or artist), ticket inventory, booking totals, scanner
 * staff names and the history of decisions taken on it.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'events:view');
  if (!check.ok) return check.response;

  try {
    const id = toObjectId(params.id);
    if (!id) return fail('Invalid event id', 400);

    const { db } = await connectToDatabase();
    const event = await db.collection('events').findOne({ _id: id });
    if (!event) return fail('Event not found', 404);

    const creatorId = toObjectId(event.organizerId);
    const artistIds = Array.isArray(event.artists) ? (event.artists.map((a: any) => toObjectId(a)).filter(Boolean) as any[]) : [];
    const venueId = toObjectId(event.venue);

    const [organizer, artistCreator, artists, venue, bookings, history] = await Promise.all([
      creatorId ? db.collection('organizers').findOne({ _id: creatorId }, { projection: PERSON }) : null,
      creatorId ? db.collection('artists').findOne({ _id: creatorId }, { projection: PERSON }) : null,
      artistIds.length ? db.collection('artists').find({ _id: { $in: artistIds } }, { projection: PERSON }).toArray() : [],
      venueId ? db.collection('venues').findOne({ _id: venueId }, { projection: { name: 1, location: 1, capacity: 1, status: 1 } }) : null,
      bookingStatsForEvent(db, id),
      db.collection('auditLogs').find({ entityType: 'event', entityId: String(id) }).sort({ createdAt: -1 }).limit(50).toArray(),
    ]);

    const seeArtists = can(check.admin, 'artists:view');
    const seeOrganizers = can(check.admin, 'organizers:view');
    const preferArtist = event.creatorRole === 'artist';
    const creator = preferArtist
      ? person(artistCreator, 'artist', seeArtists) || person(organizer, 'organizer', seeOrganizers)
      : person(organizer, 'organizer', seeOrganizers) || person(artistCreator, 'artist', seeArtists);

    const tickets = summariseTickets(event.tickets);
    const sales = can(check.admin, 'bookings:view') || can(check.admin, 'events:manage') ? await salesFor(db, id, tickets) : null;
    const media = event.media && typeof event.media === 'object' ? event.media : {};

    // The organiser app can replace an event's tickets (PATCH /api/events/[id])
    // and that route records nothing for a non-admin caller. Until it does, a
    // change made there is detected here: the tickets now on the event are
    // compared with the last ticket list written to the activity log.
    const plain = (list: any[]) =>
      (list || []).map((t: any) => ({
        name: String(t?.name ?? ''),
        blockName: String(t?.blockName ?? ''),
        price: Number(t?.price) || 0,
        quantity: Number(t?.quantity) || 0,
        startSeat: t?.startSeat ?? null,
        endSeat: t?.endSeat ?? null,
      }));
    const lastTicketEntry = history.find((h) => Array.isArray(h.after?.tickets));
    const outsideChange =
      lastTicketEntry && JSON.stringify(plain(lastTicketEntry.after.tickets)) !== JSON.stringify(plain(tickets))
        ? {
            _id: 'detected-ticket-change',
            action: 'organizer_ticket_update',
            adminName: 'Organiser or artist (organiser app)',
            adminEmail: '',
            byOrganizer: true,
            detected: true,
            meta: null,
            before: { tickets: plain(lastTicketEntry.after.tickets) },
            after: { tickets: plain(tickets) },
            reason: '',
            createdAt: event.updatedAt && new Date(event.updatedAt) > new Date(lastTicketEntry.createdAt) ? event.updatedAt : lastTicketEntry.createdAt,
          }
        : null;

    return ok({
      event: {
        _id: String(event._id),
        name: event.name || '',
        category: event.category || '',
        subCategories: Array.isArray(event.subCategories) ? event.subCategories : [],
        languages: Array.isArray(event.languages) ? event.languages : [],
        description: event.description || '',
        terms: event.terms || '',
        status: STATUSES.includes(event.status) ? event.status : 'pending',
        storedStatus: event.status ?? null,
        artistResponse: event.artistResponse || null,
        rejectionReason: event.rejectionReason || '',
        statusReason: event.statusReason || '',
        reviewedBy: event.reviewedBy || '',
        reviewedAt: event.reviewedAt || null,
        locationType: event.locationType || '',
        location: event.location || null,
        venueText: typeof event.venue === 'string' && !venueId ? event.venue : '',
        venue: venue ? { _id: String(venue._id), name: venue.name, location: venue.location, capacity: venue.capacity, status: venue.status || 'active' } : null,
        recordedDetails: event.recordedDetails || null,
        photographyContact: event.photographyContact || null,
        startDate: event.startDate || '',
        startTime: event.startTime || '',
        endDate: event.endDate || '',
        endTime: event.endTime || '',
        bannerImage: typeof media.bannerImage === 'string' ? media.bannerImage : null,
        images: Array.isArray(media.images) ? media.images.filter((i: any) => typeof i === 'string').slice(0, 12) : [],
        hasPromotionalVideo: Boolean(media.promotionalVideo),
        createdAt: event.createdAt || null,
        updatedAt: event.updatedAt || null,
      },
      creator,
      creatorMissing: Boolean(event.organizerId) && !creator,
      artists: (artists as any[]).map((a) => person(a, 'artist', seeArtists)),
      tickets,
      ticketTotals: {
        quantity: tickets.reduce((sum, t) => sum + t.quantity, 0),
        sold: tickets.reduce((sum, t) => sum + t.sold, 0),
        remaining: tickets.reduce((sum, t) => sum + t.remaining, 0),
        soldValue: tickets.reduce((sum, t) => sum + t.sold * t.price, 0),
      },
      bookings,
      sales,
      scannerStaff: staffNames(event.scannerStaff),
      history: [
        ...(outsideChange ? [outsideChange] : []),
        ...history.map((h) => ({
        _id: String(h._id),
        action: h.action,
        // Entries without an admin were written for the organiser or artist who owns the event.
        adminName: h.adminName || h.adminEmail || (h.meta?.actor === 'organizer' ? 'Organiser (organiser app)' : 'Admin'),
        byOrganizer: !h.adminEmail && h.meta?.actor === 'organizer',
        meta: h.meta || null,
        adminEmail: h.adminEmail || '',
        before: h.before || null,
        after: h.after || null,
        reason: h.reason || '',
        createdAt: h.createdAt,
      })),
      ],
      canManage: can(check.admin, 'events:manage'),
    });
  } catch (error) {
    console.error('Admin event detail failed:', error);
    return fail('Failed to load the event', 500);
  }
}

/* ------------------------------------------------------------------ */
/* Admin changes to schedule and tickets                               */
/* ------------------------------------------------------------------ */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_24 = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True for a day that exists in the calendar (rejects 30 February). */
function realDay(value: string): boolean {
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Stores a time in the style the event already uses: "7:00 PM" or "19:00". */
function formatClock(value: string, like: unknown): string {
  const match = value.match(CLOCK_24);
  if (!match) return value;
  if (typeof like === 'string' && like.trim() && !/[ap]\.?\s*m/i.test(like)) return value;
  const hours = parseInt(match[1], 10);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** Writes a number in the form the stored value already has (text such as "₹500.00", or a number). */
function likeStored(amount: number, stored: unknown, kind: 'price' | 'count'): string | number {
  if (typeof stored === 'number') return amount;
  if (kind === 'count') return String(amount);
  return '₹' + amount.toFixed(2);
}

/**
 * PATCH /api/admin/events/[id]   (events:manage)
 *   { action: 'update_schedule', startDate, startTime, endDate, endTime, reason }
 *   { action: 'update_tickets', tickets: [{ name, blockName, price, quantity, startSeat, endSeat }], reason }
 * Both need a reason and are written to the activity log with the old and
 * new values. Sold counts are never taken from the request, a quantity cannot
 * go below what is sold, and a category with sales cannot be removed.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const check = await requireAdmin(request, 'events:manage');
  if (!check.ok) return check.response;

  const id = toObjectId(params.id);
  if (!id) return fail('Invalid event id', 400);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid request body', 400);
  const action = asString(body.action, 40);
  const reason = asString(body.reason, 500);
  if (action !== 'update_schedule' && action !== 'update_tickets') return fail('Unknown action', 400);
  if (!reason) return fail('A reason is required to change an event.', 400);

  try {
    const { db } = await connectToDatabase();
    const event = await db.collection('events').findOne({ _id: id }, { projection: { media: 0, scannerStaff: 0 } });
    if (!event) return fail('Event not found', 404);
    const now = new Date();

    if (action === 'update_schedule') {
      const startDate = asString(body.startDate, 10);
      const endDate = asString(body.endDate, 10) || startDate;
      const startTime = asString(body.startTime, 5);
      const endTime = asString(body.endTime, 5);
      if (!DAY.test(startDate) || !DAY.test(endDate)) return fail('Dates must be in YYYY-MM-DD format.', 400);
      if (!realDay(startDate) || !realDay(endDate)) return fail('That date does not exist.', 400);
      if (!CLOCK_24.test(startTime) || (endTime && !CLOCK_24.test(endTime))) return fail('Times must be in HH:MM format.', 400);

      const start = parseEventDateTime(startDate, startTime);
      const end = parseEventDateTime(endDate, endTime || undefined, !endTime);
      if (!start || !end) return fail('That date does not exist.', 400);
      if (end.getTime() < start.getTime()) return fail('The event cannot end before it starts.', 400);

      const next = {
        startDate,
        startTime: formatClock(startTime, event.startTime),
        endDate,
        endTime: endTime ? formatClock(endTime, event.endTime || event.startTime) : '',
      };
      const previous = {
        startDate: event.startDate || '',
        startTime: event.startTime || '',
        endDate: event.endDate || '',
        endTime: event.endTime || '',
      };
      const before: Record<string, any> = {};
      const after: Record<string, any> = {};
      for (const key of Object.keys(next) as (keyof typeof next)[]) {
        if (String(previous[key]) !== next[key]) {
          before[key] = previous[key];
          after[key] = next[key];
        }
      }
      if (Object.keys(after).length === 0) return fail('The schedule already has these values.', 409);

      await db.collection('events').updateOne({ _id: id }, { $set: { ...after, updatedAt: now, scheduleChangedBy: check.admin.email || null, scheduleChangedAt: now } });

      // Each booking carries a copy of the event date for the ticket. Keep the
      // copy on bookings that are still live in step with the event.
      const copy: Record<string, any> = {};
      if ('startDate' in after) copy.eventDate = next.startDate;
      if ('startTime' in after) copy.eventTime = next.startTime;
      let bookingsUpdated = 0;
      if (Object.keys(copy).length) {
        const result = await db
          .collection('bookings')
          .updateMany({ eventId: eventIdMatch(id), status: { $in: ['confirmed', 'pending_payment'] } }, { $set: copy });
        bookingsUpdated = result.modifiedCount;
      }

      await logAudit({
        admin: check.admin,
        action: 'update',
        module: 'events',
        entityType: 'event',
        entityId: String(id),
        entityLabel: event.name,
        before,
        after,
        reason,
        meta: { change: 'schedule', bookingsUpdated },
        request,
      });
      return ok({ message: 'Schedule updated.', bookingsUpdated });
    }

    // update_tickets
    if (!Array.isArray(body.tickets)) return fail('Send the ticket categories.', 400);
    const stored: any[] = Array.isArray(event.tickets) ? event.tickets.filter((t: any) => t && typeof t === 'object') : [];
    const storedByKey = new Map<string, any>();
    for (const ticket of stored) if (!storedByKey.has(ticketKey(ticket))) storedByKey.set(ticketKey(ticket), ticket);
    const sample = stored[0];

    const incoming: any[] = [];
    for (const raw of body.tickets) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Each ticket must be an object', 400);
      const name = asString(raw.name, 80);
      const blockName = asString(raw.blockName, 80);
      if (!name) return fail('Every ticket category needs a name.', 400);
      const price = typeof raw.price === 'number' ? raw.price : parseAmount(raw.price);
      if (!Number.isFinite(price) || price < 0 || price > 10000000) return fail(`"${name}" needs a price of 0 or more.`, 400);
      const quantity = typeof raw.quantity === 'number' ? raw.quantity : parseInt(String(raw.quantity ?? ''), 10);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000) return fail(`"${name}" needs a whole number of tickets.`, 400);

      const previous = storedByKey.get(ticketKey({ name, blockName }));
      const seat = (value: unknown) => {
        if (value === undefined || value === null || value === '') return null;
        const n = typeof value === 'number' ? value : parseInt(String(value), 10);
        return Number.isInteger(n) && n > 0 ? n : NaN;
      };
      const startSeat = seat(raw.startSeat);
      const endSeat = seat(raw.endSeat);
      if (Number.isNaN(startSeat) || Number.isNaN(endSeat)) return fail(`"${name}" has a seat number that is not a whole number.`, 400);
      if ((startSeat === null) !== (endSeat === null)) return fail(`"${name}" needs both a first and a last seat, or neither.`, 400);
      if (startSeat !== null && endSeat !== null) {
        if (endSeat < startSeat) return fail(`"${name}": the last seat is before the first seat.`, 400);
        if (endSeat - startSeat + 1 !== quantity) {
          return fail(`"${name}": seats ${startSeat} to ${endSeat} are ${endSeat - startSeat + 1} seats, but the quantity is ${quantity}.`, 400);
        }
      }

      incoming.push({
        // Keep fields the apps stored on the ticket that this screen does not edit.
        ...(previous || {}),
        name,
        blockName,
        price: likeStored(Math.round(price * 100) / 100, previous ? previous.price : sample?.price, 'price'),
        quantity: likeStored(quantity, previous ? previous.quantity : sample?.quantity, 'count'),
        ...(startSeat !== null ? { startSeat, endSeat } : previous && 'startSeat' in previous ? { startSeat: null, endSeat: null } : {}),
      });
    }

    const merged = mergeTickets(incoming, event.tickets);
    if (merged.error || !merged.tickets) return fail(merged.error || 'The tickets could not be saved.', merged.status || 400);

    const beforeTickets = summariseTickets(event.tickets);
    const afterTickets = summariseTickets(merged.tickets);
    if (JSON.stringify(beforeTickets) === JSON.stringify(afterTickets)) return fail('The tickets already have these values.', 409);

    // Only write if the tickets are still exactly as they were read, so a sale
    // made in the meantime is never overwritten with an older sold count.
    const written = await db
      .collection('events')
      .updateOne(
        { _id: id, ...(Array.isArray(event.tickets) ? { tickets: event.tickets } : {}) },
        { $set: { tickets: merged.tickets, updatedAt: now } }
      );
    if (written.matchedCount === 0) {
      return fail('Tickets for this event were sold or changed while you were editing. Nothing was saved: reload the event and try again.', 409);
    }
    await logAudit({
      admin: check.admin,
      action: 'update',
      module: 'events',
      entityType: 'event',
      entityId: String(id),
      entityLabel: event.name,
      before: { tickets: beforeTickets },
      after: { tickets: afterTickets },
      reason,
      meta: { change: 'tickets' },
      request,
    });
    return ok({ message: 'Tickets updated.', tickets: afterTickets });
  } catch (error) {
    console.error('Admin event update failed:', error);
    return fail('Failed to update the event', 500);
  }
}
