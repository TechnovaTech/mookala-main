import { ObjectId, type Db } from 'mongodb';
import { idFilter, parseAmount, toObjectId } from './http';
import { recordPaymentWithCharges, roundMoney } from './ledger';
import { findRefundRule, quoteRefund, type RefundQuote } from './refund-rules';

/**
 * Shared booking logic: pricing, seat availability, reserving and releasing
 * inventory, confirming a paid booking, check-in and cancellation.
 *
 * HOW INVENTORY IS KEPT CONSISTENT
 *
 * The host has no MongoDB transactions and the event's ticket `quantity` and
 * `sold` are stored as text on old events, so a conditional `$inc` cannot be
 * used. Two mechanisms are used instead, one for each kind of limit:
 *
 * 1. Numbered seats: the `seatHolds` collection holds one document per
 *    reserved seat with a UNIQUE index on { eventId, block, seat }. Reserving
 *    seats is an `insertMany`; the database itself refuses the second request
 *    for a seat, so two simultaneous buyers can never both get it, whatever the
 *    timing. A hold lives as long as its booking is pending or confirmed and is
 *    deleted when the booking is cancelled or expires.
 *
 * 2. Capacity (`sold` against `quantity`): a compare-and-swap on the ticket's
 *    own stored values. The event is read, the new `sold` is computed, and the
 *    update only applies if that ticket's `name`, `quantity` and `sold` are
 *    still exactly what was read (`tickets.<i>.sold: <value read>`), in a short
 *    retry loop. Comparing the values themselves, rather than a separate
 *    version field, also catches a concurrent organiser edit made by code that
 *    knows nothing about this file. Only `tickets.<i>.sold` is written, never
 *    the whole `tickets` array, and the value keeps the type it had (text
 *    stays text).
 *
 * Bookings made before `seatHolds` existed have no hold documents, so seat
 * requests are also compared with the seat ranges on existing bookings.
 *
 * The three writes of a reservation (booking, seat holds, sold count) are not
 * one transaction. A booking starts with `inventoryReserved: false` and is
 * only switched to `true` after both other writes succeeded; any failure
 * undoes the earlier steps. A process crash between the steps can leave a
 * hold or a count behind for one booking; that is the remaining gap.
 */

export const HOLD_MINUTES = 15;
/** Technical limits, so one request cannot lock a whole venue for 15 minutes. */
export const MAX_SEATS_PER_BOOKING = 100;
export const MAX_LINES_PER_BOOKING = 20;

export const BOOKING_STATUSES = ['pending_payment', 'confirmed', 'attended', 'cancelled', 'expired'] as const;
export const PAYMENT_STATUSES = ['pending', 'paid', 'unverified', 'failed', 'refund_requested', 'refunded'] as const;

export class BookingError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'INVALID_BOOKING') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function legacyUnverifiedAllowed(): boolean {
  return process.env.LEGACY_UNVERIFIED_BOOKINGS === 'allow';
}

/* ------------------------------------------------------------------ */
/* Small parsers                                                       */
/* ------------------------------------------------------------------ */

/** A whole number from a number or numeric text; NaN for anything else. */
export function parseWhole(value: unknown): number {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) return parseInt(value, 10);
  return NaN;
}

/** Counts stored on an event ("120", 120, "120 seats"): 0 when unreadable. */
function storedCount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (typeof value === 'string') {
    const parsed = parseInt(value.replace(/[^0-9\-]/g, ''), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

const IST_OFFSET_MINUTES = 330;

function parseClock(value: unknown): { h: number; m: number } | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(?:([AaPp])\.?\s*[Mm]\.?)?$/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (match[3]) {
    const pm = match[3].toLowerCase() === 'p';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/**
 * Event dates are stored as text ("2026-12-05" and "6:30 PM"). They are read
 * as India time. Returns null when the date cannot be understood: callers must
 * not guess in that case.
 */
export function parseEventDateTime(dateValue: unknown, timeValue?: unknown, endOfDayWithoutTime = false): Date | null {
  if (dateValue instanceof Date) return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  const text = typeof dateValue === 'string' ? dateValue.trim() : '';
  if (!text) return null;

  let y: number, mo: number, d: number;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    y = +match[1];
    mo = +match[2];
    d = +match[3];
  } else if ((match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) {
    d = +match[1];
    mo = +match[2];
    y = +match[3];
  } else {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    if (/\dT\d/.test(text)) return parsed; // full ISO timestamp already carries its time
    const shifted = new Date(parsed.getTime() + IST_OFFSET_MINUTES * 60000);
    y = shifted.getUTCFullYear();
    mo = shifted.getUTCMonth() + 1;
    d = shifted.getUTCDate();
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  // Reject dates that do not exist, such as 30 February, instead of rolling them into March.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;

  const clock = parseClock(timeValue) || (endOfDayWithoutTime ? { h: 23, m: 59 } : { h: 0, m: 0 });
  return new Date(Date.UTC(y, mo - 1, d, clock.h, clock.m) - IST_OFFSET_MINUTES * 60000);
}

export function eventStart(event: any, booking?: any): Date | null {
  return (
    parseEventDateTime(event?.startDate, event?.startTime) ||
    parseEventDateTime(booking?.eventDate, booking?.eventTime)
  );
}

function eventEnd(event: any): Date | null {
  return (
    parseEventDateTime(event?.endDate, event?.endTime, true) ||
    parseEventDateTime(event?.startDate, undefined, true)
  );
}

/* ------------------------------------------------------------------ */
/* Events and tickets                                                  */
/* ------------------------------------------------------------------ */

const EVENT_PROJECTION = {
  name: 1,
  status: 1,
  organizerId: 1,
  creatorRole: 1,
  startDate: 1,
  startTime: 1,
  endDate: 1,
  endTime: 1,
  location: 1,
  venue: 1,
  tickets: 1,
};

export async function findEvent(db: Db, eventId: unknown): Promise<any | null> {
  const oid = toObjectId(eventId);
  if (!oid) return null;
  return db.collection('events').findOne({ _id: oid }, { projection: EVENT_PROJECTION });
}

/** The event a booking is being made for, or an error the customer can read. */
export async function loadBookableEvent(db: Db, eventId: unknown): Promise<any> {
  if (!toObjectId(eventId)) throw new BookingError('A valid eventId is required', 400, 'INVALID_EVENT');
  const event = await findEvent(db, eventId);
  if (!event) throw new BookingError('This event could not be found', 404, 'EVENT_NOT_FOUND');
  if (event.status !== 'approved') {
    throw new BookingError('This event is not open for booking', 409, 'EVENT_NOT_OPEN');
  }
  const end = eventEnd(event);
  if (end && end.getTime() < Date.now()) {
    throw new BookingError('This event has already taken place', 409, 'EVENT_OVER');
  }
  if (!Array.isArray(event.tickets) || event.tickets.length === 0) {
    throw new BookingError('This event has no tickets on sale', 409, 'NO_TICKETS');
  }
  return event;
}

async function venueName(db: Db, event: any): Promise<string> {
  if (typeof event?.location?.name === 'string' && event.location.name.trim()) return event.location.name.trim();
  const venue = typeof event?.venue === 'string' ? event.venue.trim() : '';
  const oid = toObjectId(venue);
  if (oid) {
    const doc = await db.collection('venues').findOne({ _id: oid }, { projection: { name: 1 } });
    return typeof doc?.name === 'string' ? doc.name : '';
  }
  return venue;
}

/** Index of the event ticket a line refers to: both names, then category, then block. */
export function matchTicket(tickets: any[], category: unknown, block: unknown): number {
  if (!Array.isArray(tickets)) return -1;
  const c = typeof category === 'string' ? category.trim() : '';
  const b = typeof block === 'string' ? block.trim() : '';
  const same = (left: unknown, right: string) => typeof left === 'string' && right !== '' && left.trim() === right;

  let index = tickets.findIndex((t) => same(t?.name, c) && same(t?.blockName, b));
  if (index === -1) index = tickets.findIndex((t) => same(t?.name, c));
  if (index === -1) index = tickets.findIndex((t) => same(t?.blockName, b));
  return index;
}

/** The key seats are unique under: the physical block, or the category when it has none. */
function holdKey(ticket: any, fallbackBlock?: unknown, fallbackCategory?: unknown): string {
  const block = typeof ticket?.blockName === 'string' ? ticket.blockName.trim() : '';
  if (block) return block;
  const name = typeof ticket?.name === 'string' ? ticket.name.trim() : '';
  if (name) return name;
  const fb = typeof fallbackBlock === 'string' ? fallbackBlock.trim() : '';
  return fb || (typeof fallbackCategory === 'string' ? fallbackCategory.trim() : '');
}

function holdKeyForLine(event: any, line: any): string {
  const tickets = Array.isArray(event?.tickets) ? event.tickets : [];
  const index = matchTicket(tickets, line?.category, line?.block);
  return holdKey(index === -1 ? null : tickets[index], line?.block, line?.category);
}

export interface PricedLine {
  category: string;
  block: string;
  fromSeat: number | null;
  toSeat: number | null;
  quantity: number;
  price: number;
  totalPrice: number;
}

export interface PricedDraft {
  lines: PricedLine[];
  totalSeats: number;
  totalPrice: number;
}

/**
 * Prices a requested set of tickets from the event document. Nothing about
 * money is taken from the client: unknown categories, zero or negative
 * quantities and inverted or out-of-block seat ranges are rejected.
 */
export function priceDraft(event: any, requested: unknown): PricedDraft {
  if (!Array.isArray(requested) || requested.length === 0) {
    throw new BookingError('Choose at least one ticket', 400, 'NO_TICKETS_REQUESTED');
  }
  if (requested.length > MAX_LINES_PER_BOOKING) {
    throw new BookingError(`A booking can have at most ${MAX_LINES_PER_BOOKING} ticket lines`, 400, 'TOO_MANY_LINES');
  }

  const tickets: any[] = Array.isArray(event?.tickets) ? event.tickets : [];
  const lines: PricedLine[] = [];
  const ranges: { key: string; from: number; to: number }[] = [];

  for (const raw of requested) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BookingError('A ticket line is not valid', 400, 'INVALID_LINE');
    }
    const line = raw as Record<string, unknown>;
    const index = matchTicket(tickets, line.category, line.block);
    if (index === -1) {
      const label = typeof line.category === 'string' && line.category.trim() ? line.category.trim().slice(0, 60) : 'that';
      throw new BookingError(`The "${label}" ticket category is not sold for this event`, 400, 'UNKNOWN_CATEGORY');
    }
    const ticket = tickets[index];
    const name = String(ticket.name ?? '').trim();
    const blockName = typeof ticket.blockName === 'string' ? ticket.blockName.trim() : '';
    const capacity = storedCount(ticket.quantity);

    const hasSeats = !isBlank(line.fromSeat) || !isBlank(line.toSeat);
    let quantity: number;
    let from: number | null = null;
    let to: number | null = null;

    if (hasSeats) {
      from = parseWhole(line.fromSeat);
      to = parseWhole(line.toSeat);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < 1) {
        throw new BookingError(`Seat numbers for ${name} are not valid`, 400, 'INVALID_SEATS');
      }
      if (from > to) {
        throw new BookingError(`Seat range ${from}-${to} for ${name} is the wrong way round`, 400, 'INVALID_SEATS');
      }
      const first = storedCount(ticket.startSeat) || 1;
      const last = storedCount(ticket.endSeat) || first + capacity - 1;
      if (from < first || to > last) {
        throw new BookingError(`Seats ${from}-${to} are outside ${name} (${first}-${last})`, 400, 'SEATS_OUTSIDE_BLOCK');
      }
      quantity = to - from + 1;
      if (!isBlank(line.quantity) && parseWhole(line.quantity) !== quantity) {
        throw new BookingError(
          `Seats ${from}-${to} are ${quantity} seat(s), but the quantity sent for ${name} does not match`,
          400,
          'QUANTITY_MISMATCH'
        );
      }
      const key = holdKey(ticket);
      if (ranges.some((r) => r.key === key && from! <= r.to && to! >= r.from)) {
        throw new BookingError(`The same seats in ${name} were requested twice`, 400, 'DUPLICATE_SEATS');
      }
      ranges.push({ key, from, to });
    } else {
      if (storedCount(ticket.startSeat) > 0 && storedCount(ticket.endSeat) > 0) {
        throw new BookingError(`Choose seats for ${name}`, 400, 'SEATS_REQUIRED');
      }
      quantity = parseWhole(line.quantity);
      if (!Number.isFinite(quantity) || quantity < 1) {
        throw new BookingError('Ticket quantity must be at least 1', 400, 'INVALID_QUANTITY');
      }
    }

    const price = roundMoney(parseAmount(ticket.price));
    if (price < 0) {
      throw new BookingError(`The price of ${name} is not set correctly. Please contact the organiser.`, 409, 'INVALID_PRICE');
    }

    lines.push({
      category: name,
      block: blockName || (typeof line.block === 'string' ? line.block.trim().slice(0, 60) : ''),
      fromSeat: from,
      toSeat: to,
      quantity,
      price,
      totalPrice: roundMoney(price * quantity),
    });
  }

  const totalSeats = lines.reduce((sum, l) => sum + l.quantity, 0);
  if (totalSeats > MAX_SEATS_PER_BOOKING) {
    throw new BookingError(`A single booking can have at most ${MAX_SEATS_PER_BOOKING} seats`, 400, 'TOO_MANY_SEATS');
  }

  return { lines, totalSeats, totalPrice: roundMoney(lines.reduce((sum, l) => sum + l.totalPrice, 0)) };
}

/* ------------------------------------------------------------------ */
/* Indexes                                                             */
/* ------------------------------------------------------------------ */

let indexesReady: Promise<void> | null = null;

export function ensureBookingIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      await db.collection('seatHolds').createIndex({ eventId: 1, block: 1, seat: 1 }, { unique: true });
      await db.collection('seatHolds').createIndex({ bookingId: 1 });
      await db.collection('bookings').createIndex({ gatewayOrderId: 1 }, { sparse: true });
      await db.collection('bookings').createIndex({ status: 1, expiresAt: 1 });
    })().catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
}

/* ------------------------------------------------------------------ */
/* Availability, reserve and release                                   */
/* ------------------------------------------------------------------ */

function bookingsOfEvent(event: any): Record<string, any> {
  // Old app versions stored the event title in `eventId` when they had no id.
  const ids = [String(event._id)];
  if (typeof event.name === 'string' && event.name) ids.push(event.name);
  return { eventId: { $in: ids } };
}

/**
 * Throws when a requested seat is already on a booking that still holds it:
 * anything not cancelled or expired, including a `pending_payment` booking
 * whose hold has not run out yet.
 */
export async function assertSeatsFree(db: Db, event: any, lines: PricedLine[], ignoreBookingId?: string): Promise<void> {
  const wanted = lines
    .filter((l) => l.fromSeat !== null && l.toSeat !== null)
    .map((l) => ({ key: holdKeyForLine(event, l), from: l.fromSeat as number, to: l.toSeat as number, name: l.category }));
  if (wanted.length === 0) return;

  const now = Date.now();
  const cursor = db.collection('bookings').find(
    { ...bookingsOfEvent(event), status: { $nin: ['cancelled', 'expired'] }, inventoryReserved: { $ne: false } },
    { projection: { tickets: 1, status: 1, expiresAt: 1 } }
  );

  for await (const booking of cursor) {
    if (ignoreBookingId && String(booking._id) === ignoreBookingId) continue;
    if (booking.status === 'pending_payment' && booking.expiresAt && new Date(booking.expiresAt).getTime() <= now) continue;
    for (const taken of Array.isArray(booking.tickets) ? booking.tickets : []) {
      const from = parseWhole(taken?.fromSeat);
      const to = parseWhole(taken?.toSeat);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      const key = holdKeyForLine(event, taken);
      const clash = wanted.find((w) => w.key === key && w.from <= to && w.to >= from);
      if (clash) {
        const first = Math.max(clash.from, from);
        const last = Math.min(clash.to, to);
        throw new BookingError(
          `Seat${first === last ? ' ' + first : 's ' + first + '-' + last} in ${clash.name} ${first === last ? 'is' : 'are'} already booked`,
          409,
          'SEATS_TAKEN'
        );
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Adds to (direction +1) or takes from (-1) the `sold` count of the event's
 * tickets with compare-and-swap, as described at the top of this file. When
 * adding, the capacity is enforced inside the same loop.
 */
async function adjustSold(db: Db, eventId: unknown, lines: any[], direction: 1 | -1): Promise<void> {
  const oid = toObjectId(eventId);
  if (!oid) return;

  for (let attempt = 0; attempt < 12; attempt++) {
    const event = await db.collection('events').findOne({ _id: oid }, { projection: { tickets: 1 } });
    const tickets: any[] = Array.isArray(event?.tickets) ? event!.tickets : [];
    if (!event || tickets.length === 0) {
      if (direction === 1) throw new BookingError('This event has no tickets on sale', 409, 'NO_TICKETS');
      return;
    }

    const delta = new Map<number, number>();
    for (const line of lines) {
      const index = matchTicket(tickets, line?.category, line?.block);
      const quantity = parseWhole(line?.quantity);
      if (index === -1 || !Number.isFinite(quantity) || quantity <= 0) {
        if (direction === 1) throw new BookingError('A ticket category is no longer sold for this event', 409, 'UNKNOWN_CATEGORY');
        continue;
      }
      delta.set(index, (delta.get(index) || 0) + quantity);
    }
    if (delta.size === 0) return;

    const filter: Record<string, any> = { _id: oid };
    const set: Record<string, any> = {};
    const same = (path: string, raw: unknown) => {
      filter[path] = raw === undefined ? { $exists: false } : raw;
    };

    for (const [index, amount] of delta) {
      const ticket = tickets[index];
      const sold = storedCount(ticket.sold);
      const capacity = storedCount(ticket.quantity);
      if (direction === 1 && sold + amount > capacity) {
        const left = Math.max(0, capacity - sold);
        throw new BookingError(
          left === 0 ? `${ticket.name} is sold out` : `Only ${left} seat(s) left in ${ticket.name}`,
          409,
          'SOLD_OUT'
        );
      }
      const next = direction === 1 ? sold + amount : Math.max(0, sold - amount);
      same(`tickets.${index}.name`, ticket.name);
      same(`tickets.${index}.quantity`, ticket.quantity);
      same(`tickets.${index}.sold`, ticket.sold);
      set[`tickets.${index}.sold`] = typeof ticket.sold === 'number' ? next : String(next);
    }

    const result = await db.collection('events').updateOne(filter, { $set: set });
    if (result.matchedCount === 1) return;
    await sleep(5 + Math.floor(Math.random() * 15 * (attempt + 1)));
  }

  throw new BookingError('Bookings for this event are very busy. Please try again.', 503, 'BUSY');
}

/**
 * Takes the seats and the capacity for a booking, or throws and leaves
 * nothing behind. Safe against simultaneous requests (see the file header).
 */
export async function reserveInventory(db: Db, event: any, bookingId: string, lines: PricedLine[]): Promise<void> {
  await ensureBookingIndexes(db);
  const eventId = String(event._id);
  const now = new Date();
  const seats: any[] = [];
  for (const line of lines) {
    if (line.fromSeat === null || line.toSeat === null) continue;
    const block = holdKeyForLine(event, line);
    for (let seat = line.fromSeat; seat <= line.toSeat; seat++) {
      seats.push({ eventId, block, seat, bookingId, createdAt: now });
    }
  }

  if (seats.length > 0) {
    try {
      await db.collection('seatHolds').insertMany(seats, { ordered: false });
    } catch (error: any) {
      await db.collection('seatHolds').deleteMany({ bookingId });
      if (error?.code === 11000 || Array.isArray(error?.writeErrors)) {
        throw new BookingError('Some of these seats have just been booked by someone else', 409, 'SEATS_TAKEN');
      }
      throw error;
    }
  }

  try {
    await adjustSold(db, event._id, lines, 1);
  } catch (error) {
    if (seats.length > 0) await db.collection('seatHolds').deleteMany({ bookingId });
    throw error;
  }
}

/**
 * Frees the seats and lowers `sold` for a cancelled or expired booking. Runs
 * at most once per booking however many times it is called.
 */
export async function releaseBooking(db: Db, booking: any, reason: string): Promise<{ released: boolean }> {
  if (!booking?._id) return { released: false };
  const claim = await db.collection('bookings').updateOne(
    { _id: booking._id, inventoryReleasedAt: { $exists: false } },
    { $set: { inventoryReleasedAt: new Date(), inventoryReleaseReason: reason } }
  );
  if (claim.modifiedCount !== 1) return { released: false };

  await db.collection('seatHolds').deleteMany({ bookingId: String(booking._id) });
  // `inventoryReserved: false` marks a booking that never took inventory.
  // Bookings from before this field existed did raise `sold`.
  if (booking.inventoryReserved !== false && Array.isArray(booking.tickets)) {
    try {
      await adjustSold(db, booking.eventId, booking.tickets, -1);
    } catch (error) {
      console.error('Could not lower the sold count for booking', String(booking._id), error);
    }
  }
  return { released: true };
}

/**
 * There is no scheduler on the host, so holds are expired lazily: every read
 * of an event's bookings and every new order calls this first. A
 * `pending_payment` booking past its expiry becomes 'expired' and gives its
 * seats back.
 */
export async function expireStaleHolds(db: Db, scope: { eventId?: string; userPhone?: string } = {}): Promise<number> {
  const now = new Date();
  const filter: Record<string, any> = { status: 'pending_payment', expiresAt: { $lte: now } };
  if (scope.eventId) filter.eventId = scope.eventId;
  if (scope.userPhone) filter.userPhone = scope.userPhone;

  const stale = await db.collection('bookings').find(filter).limit(500).toArray();
  let expired = 0;
  for (const booking of stale) {
    const result = await db.collection('bookings').updateOne(
      { _id: booking._id, status: 'pending_payment', expiresAt: { $lte: now } },
      { $set: { status: 'expired', expiredAt: now, updatedAt: now } }
    );
    if (result.modifiedCount === 1) {
      expired++;
      await releaseBooking(db, booking, 'expired');
    }
  }
  return expired;
}

/** A customer who starts again must not be blocked by their own unfinished order. */
async function supersedeOwnHolds(db: Db, userPhone: string, eventId: string): Promise<void> {
  const open = await db
    .collection('bookings')
    .find({ userPhone, eventId, status: 'pending_payment', source: 'order', pendingGatewayPaymentId: { $exists: false } })
    .toArray();
  const now = new Date();
  for (const booking of open) {
    const result = await db.collection('bookings').updateOne(
      { _id: booking._id, status: 'pending_payment', pendingGatewayPaymentId: { $exists: false } },
      { $set: { status: 'expired', expiredAt: now, expiredReason: 'Replaced by a newer order', updatedAt: now } }
    );
    if (result.modifiedCount === 1) await releaseBooking(db, booking, 'superseded');
  }
}

/* ------------------------------------------------------------------ */
/* Creating a booking                                                  */
/* ------------------------------------------------------------------ */

export type PlaceMode =
  | 'hold' // paid event: pending_payment with seats held until expiry
  | 'free' // free event: confirmed at once
  | 'legacy_unpaid' // old app, paid event: recorded but never a ticket, takes no seats
  | 'legacy_demo'; // old app with LEGACY_UNVERIFIED_BOOKINGS=allow: confirmed, payment unverified

export async function placeBooking(
  db: Db,
  input: { event: any; userPhone: string; draft: PricedDraft; mode: PlaceMode; source: 'order' | 'legacy'; clientPaymentId?: string }
): Promise<any> {
  const { event, userPhone, draft, mode } = input;
  const now = new Date();
  const eventId = String(event._id);
  const reserves = mode !== 'legacy_unpaid';

  if (reserves) {
    // Holds that ran out stop counting here, whoever calls this.
    await expireStaleHolds(db, { eventId });
    if (mode === 'hold') await supersedeOwnHolds(db, userPhone, eventId);
    await assertSeatsFree(db, event, draft.lines);
  }

  const pending = mode === 'hold' || mode === 'legacy_unpaid';
  const booking: Record<string, any> = {
    _id: new ObjectId(),
    userPhone,
    eventId,
    eventTitle: String(event.name ?? ''),
    eventDate: typeof event.startDate === 'string' ? event.startDate : '',
    eventTime: typeof event.startTime === 'string' ? event.startTime : '',
    venue: await venueName(db, event),
    tickets: draft.lines,
    totalSeats: draft.totalSeats,
    totalPrice: draft.totalPrice,
    status: pending ? 'pending_payment' : 'confirmed',
    paymentStatus: mode === 'hold' ? 'pending' : mode === 'free' ? 'paid' : 'unverified',
    paymentId: null,
    gatewayOrderId: null,
    gatewayPaymentId: null,
    amountPaid: 0,
    isFree: draft.totalPrice === 0,
    payeeType: event.creatorRole === 'artist' ? 'artist' : 'organizer',
    payeeId: event.organizerId ? String(event.organizerId) : null,
    source: input.source,
    inventoryReserved: false,
    checkedIn: false,
    checkedInAt: null,
    bookingDate: now.toISOString(),
    createdAt: now,
    updatedAt: now,
  };
  if (pending) booking.expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60000);
  if (!pending) booking.confirmedAt = now;
  // What an old app claimed as its payment id is kept for the record only.
  if (input.clientPaymentId) booking.clientPaymentId = input.clientPaymentId;

  await db.collection('bookings').insertOne(booking);

  if (reserves) {
    try {
      await reserveInventory(db, event, String(booking._id), draft.lines);
      await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { inventoryReserved: true } });
      booking.inventoryReserved = true;
    } catch (error) {
      await db.collection('bookings').deleteOne({ _id: booking._id });
      throw error;
    }
  }
  return booking;
}

/* ------------------------------------------------------------------ */
/* Lookup and presentation                                             */
/* ------------------------------------------------------------------ */

export async function findBooking(db: Db, id: unknown): Promise<any | null> {
  if (typeof id !== 'string' || !id.trim()) return null;
  return db.collection('bookings').findOne(idFilter(id.trim()));
}

/**
 * Rows written before payments were verified say 'paid' on the client's word
 * alone. Unless a gateway payment id is on the booking (or nothing was owed)
 * such a row counts as 'unverified'.
 */
export function effectivePaymentStatus(booking: any): string {
  const status = typeof booking?.paymentStatus === 'string' ? booking.paymentStatus : '';
  if (status !== 'paid') return status || 'unverified';
  if (booking.gatewayPaymentId) return 'paid';
  if (booking.isFree === true || parseAmount(booking.totalPrice) === 0) return 'paid';
  return 'unverified';
}

/**
 * The database form of `effectivePaymentStatus(...) === 'unverified'` for
 * bookings that are tickets today: issued (not cancelled, expired or still
 * awaiting payment) without the gateway ever confirming the money. These come
 * from old app versions and from LEGACY_UNVERIFIED_BOOKINGS=allow.
 */
export function unverifiedTicketFilter(): Record<string, any> {
  return {
    status: { $nin: ['cancelled', 'expired', 'pending_payment'] },
    $or: [
      { paymentStatus: { $in: ['unverified', null, ''] } },
      {
        paymentStatus: 'paid',
        gatewayPaymentId: { $not: { $type: 'string' } },
        isFree: { $ne: true },
        totalPrice: { $nin: [0, '0', '', null] },
      },
    ],
  };
}

/** How many unverified tickets exist and what they claim to be worth. They are in no ledger figure. */
export async function unverifiedTicketTotals(db: Db): Promise<{ count: number; value: number; capped: boolean }> {
  const CAP = 20000;
  const rows = await db
    .collection('bookings')
    .find(unverifiedTicketFilter(), { projection: { totalPrice: 1, paymentStatus: 1, gatewayPaymentId: 1, isFree: 1 } })
    .limit(CAP)
    .toArray();
  // Amounts on old rows can be text ("₹500.00"), so they are read here, not summed in the database.
  const own = rows.filter((row) => effectivePaymentStatus(row) === 'unverified');
  return {
    count: own.length,
    value: roundMoney(own.reduce((total, row) => total + parseAmount(row.totalPrice), 0)),
    capped: rows.length >= CAP,
  };
}

export function publicBooking(booking: any) {
  if (!booking) return null;
  const { inventoryReserved, inventoryReleasedAt, inventoryReleaseReason, clientPaymentId, ...rest } = booking;
  return { ...rest, _id: String(booking._id) };
}

/* ------------------------------------------------------------------ */
/* Confirming a payment                                                */
/* ------------------------------------------------------------------ */

async function payeeName(db: Db, booking: any): Promise<string | null> {
  const oid = toObjectId(booking.payeeId);
  if (!oid) return null;
  const collection = booking.payeeType === 'artist' ? 'artists' : 'organizers';
  const doc = await db.collection(collection).findOne({ _id: oid }, { projection: { name: 1 } });
  return typeof doc?.name === 'string' ? doc.name : null;
}

async function writePaymentLedger(db: Db, booking: any, paymentId: string, orderId: string | null, amount: number) {
  const result = await recordPaymentWithCharges(db, {
    service: 'ticketing',
    amount,
    bookingId: String(booking._id),
    eventId: booking.eventId ? String(booking.eventId) : null,
    payeeType: booking.payeeType || null,
    payeeId: booking.payeeId || null,
    payeeName: await payeeName(db, booking),
    customerPhone: booking.userPhone || null,
    gatewayOrderId: orderId,
    gatewayPaymentId: paymentId,
    description: `Tickets for ${booking.eventTitle || 'event'}`,
  });
  const reference = (result.payment as any)?.reference || null;
  if (reference) {
    await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { ledgerReference: reference } });
  }
  return reference as string | null;
}

export interface GatewayPayment {
  id: string;
  orderId: string | null;
  amountPaise: number;
  method?: string | null;
}

export type ConfirmOutcome = 'confirmed' | 'already_confirmed' | 'late_refund';

/**
 * Marks a booking paid after the gateway has confirmed the money, and writes
 * the ledger. Used by both the checkout verification and the webhook; only
 * the caller that wins the status change writes the ledger, so running both
 * at once does not double count.
 *
 * If the money arrives after the hold was released (expired, replaced or a
 * failed attempt), the seats are taken again when still free. When they are
 * gone the payment is recorded, the booking is cancelled and a full refund
 * request is opened for the finance team.
 */
export async function confirmPaidBooking(
  db: Db,
  bookingInput: any,
  payment: GatewayPayment,
  via: 'verify' | 'webhook' | 'reconciliation'
): Promise<{ outcome: ConfirmOutcome; booking: any }> {
  let booking = bookingInput;
  const expectedPaise = Math.round(parseAmount(booking.totalPrice) * 100);
  if (payment.amountPaise !== expectedPaise) {
    throw new BookingError('The amount paid does not match this booking', 409, 'AMOUNT_MISMATCH');
  }
  if (payment.orderId && booking.gatewayOrderId && payment.orderId !== booking.gatewayOrderId) {
    throw new BookingError('This payment belongs to a different order', 409, 'ORDER_MISMATCH');
  }
  const amount = roundMoney(payment.amountPaise / 100);
  const now = new Date();
  const paidFields = {
    paymentStatus: 'paid',
    paymentId: payment.id,
    gatewayPaymentId: payment.id,
    amountPaid: amount,
    paymentMethod: payment.method || null,
    paidAt: now,
    confirmedVia: via,
    updatedAt: now,
  };

  for (let round = 0; round < 3; round++) {
    if (booking.status === 'confirmed' || booking.status === 'attended') {
      if (booking.gatewayPaymentId && booking.gatewayPaymentId !== payment.id) {
        throw new BookingError('This booking was already paid with a different payment', 409, 'ALREADY_PAID');
      }
      // Repairs the rare case where the ledger write of the first call never
      // finished (the booking was marked paid, then the write failed). The
      // ledger allows one payment entry per gateway payment, so this cannot
      // write a second one even if the first call is still running.
      if (!booking.ledgerReference && booking.paidAt && booking.gatewayPaymentId === payment.id) {
        const reference = await writePaymentLedger(db, booking, payment.id, booking.gatewayOrderId || payment.orderId, amount);
        if (reference) booking = { ...booking, ledgerReference: reference };
      }
      return { outcome: 'already_confirmed', booking };
    }

    if (booking.status === 'pending_payment') {
      const won = await db.collection('bookings').updateOne(
        { _id: booking._id, status: 'pending_payment' },
        { $set: { ...paidFields, status: 'confirmed', confirmedAt: now }, $unset: { expiresAt: '' } }
      );
      if (won.modifiedCount === 1) {
        await writePaymentLedger(db, booking, payment.id, booking.gatewayOrderId || payment.orderId, amount);
        return { outcome: 'confirmed', booking: await db.collection('bookings').findOne({ _id: booking._id }) };
      }
    } else if (booking.status === 'expired') {
      // Take the booking back out of 'expired' so only one caller revives it.
      const claimed = await db.collection('bookings').updateOne(
        { _id: booking._id, status: 'expired' },
        {
          $set: { status: 'pending_payment', inventoryReserved: false, revivedAt: now, updatedAt: now },
          $unset: { inventoryReleasedAt: '', inventoryReleaseReason: '', expiredAt: '', expiredReason: '' },
        }
      );
      if (claimed.modifiedCount === 1) {
        let reserved = false;
        try {
          const event = await findEvent(db, booking.eventId);
          if (event) {
            await assertSeatsFree(db, event, booking.tickets, String(booking._id));
            await reserveInventory(db, event, String(booking._id), booking.tickets);
            reserved = true;
          }
        } catch (error) {
          if (!(error instanceof BookingError)) throw error;
        }
        if (reserved) {
          await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { inventoryReserved: true } });
        } else {
          return lateRefund(db, booking, payment, amount, paidFields);
        }
      }
    } else if (booking.status === 'cancelled') {
      if (booking.gatewayPaymentId) return { outcome: 'already_confirmed', booking };
      return lateRefund(db, booking, payment, amount, paidFields);
    } else {
      throw new BookingError('This booking cannot be paid', 409, 'NOT_PAYABLE');
    }

    booking = await db.collection('bookings').findOne({ _id: booking._id });
    if (!booking) throw new BookingError('Booking not found', 404, 'NOT_FOUND');
  }
  throw new BookingError('The booking is being updated. Please try again.', 503, 'BUSY');
}

async function lateRefund(db: Db, booking: any, payment: GatewayPayment, amount: number, paidFields: Record<string, any>) {
  const now = new Date();
  const reason = 'Payment arrived after the seat hold ended and the seats were no longer available';
  const won = await db.collection('bookings').updateOne(
    { _id: booking._id, status: { $in: ['pending_payment', 'cancelled'] }, gatewayPaymentId: null },
    {
      $set: {
        ...paidFields,
        status: 'cancelled',
        paymentStatus: 'refund_requested',
        cancelledAt: booking.cancelledAt || now,
        cancelledBy: booking.cancelledBy || 'system',
        cancelReason: booking.cancelReason || reason,
      },
      $unset: { expiresAt: '' },
    }
  );
  if (won.modifiedCount === 1) {
    const reference = await writePaymentLedger(db, booking, payment.id, booking.gatewayOrderId || payment.orderId, amount);
    const refund = await db.collection('refunds').insertOne(
      refundDocument(
        { ...booking, gatewayPaymentId: payment.id, ledgerReference: reference },
        {
          amountPaid: amount,
          quote: {
            eligible: true,
            ruleId: null,
            ruleName: null,
            refundPercent: 100,
            deductionAmount: 0,
            refundAmount: amount,
            explanation: 'Full refund: the ticket could not be issued.',
            ruleSnapshot: null,
          },
          reason,
          requestedBy: 'system',
        }
      )
    );
    await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { refundId: String(refund.insertedId) } });
    await db.collection('seatHolds').deleteMany({ bookingId: String(booking._id) });
  }
  return { outcome: 'late_refund' as const, booking: await db.collection('bookings').findOne({ _id: booking._id }) };
}

/**
 * Resolves an unverified ticket by attaching the gateway payment that paid for
 * it. The caller has already fetched `payment` from the gateway and confirmed
 * it is captured; this checks that it fits this booking and is not in use
 * anywhere else, marks the booking paid and writes the ledger (payment plus
 * commission, GST and gateway fee under the rule in force now).
 */
export async function verifyUnverifiedBooking(
  db: Db,
  booking: any,
  payment: GatewayPayment,
  by: string
): Promise<{ booking: any; ledgerReference: string | null }> {
  if (effectivePaymentStatus(booking) !== 'unverified') {
    throw new BookingError('The payment for this booking is not unverified', 409, 'NOT_UNVERIFIED');
  }
  if (booking.status !== 'confirmed' && booking.status !== 'attended') {
    throw new BookingError('Only a booking that is a ticket (confirmed or attended) can be verified', 409, 'NOT_A_TICKET');
  }
  const expectedPaise = Math.round(parseAmount(booking.totalPrice) * 100);
  if (payment.amountPaise !== expectedPaise) {
    throw new BookingError(
      `That payment is for ₹${roundMoney(payment.amountPaise / 100)}, but this booking costs ₹${roundMoney(expectedPaise / 100)}`,
      409,
      'AMOUNT_MISMATCH'
    );
  }

  const key = String(booking._id);
  const inUse: Record<string, any>[] = [{ gatewayPaymentId: payment.id }];
  if (payment.orderId) inUse.push({ gatewayOrderId: payment.orderId });
  const other = await db.collection('bookings').findOne({ _id: { $ne: booking._id }, $or: inUse }, { projection: { _id: 1 } });
  if (other) {
    throw new BookingError(`That payment already belongs to booking ${String(other._id)}`, 409, 'PAYMENT_USED');
  }
  const entry = await db.collection('transactions').findOne({ type: 'payment', gatewayPaymentId: payment.id });
  if (entry && entry.status !== 'failed' && String(entry.bookingId || '') !== key) {
    throw new BookingError(`That payment is already in the ledger as ${entry.reference}`, 409, 'PAYMENT_USED');
  }

  const amount = roundMoney(payment.amountPaise / 100);
  const now = new Date();
  const won = await db.collection('bookings').updateOne(
    { _id: booking._id, status: booking.status, gatewayPaymentId: { $in: [null, ''] } },
    {
      $set: {
        paymentStatus: 'paid',
        paymentId: payment.id,
        gatewayPaymentId: payment.id,
        gatewayOrderId: booking.gatewayOrderId || payment.orderId || null,
        amountPaid: amount,
        paymentMethod: payment.method || null,
        paidAt: now,
        confirmedVia: 'admin',
        verifiedBy: by,
        verifiedAt: now,
        paymentStatusBeforeVerification: booking.paymentStatus ?? null,
        updatedAt: now,
      },
    }
  );
  if (won.modifiedCount !== 1) {
    throw new BookingError('This booking has just changed. Please reload and try again.', 409, 'CHANGED');
  }
  const ledgerReference = await writePaymentLedger(db, booking, payment.id, booking.gatewayOrderId || payment.orderId, amount);
  return { booking: await db.collection('bookings').findOne({ _id: booking._id }), ledgerReference };
}

/* ------------------------------------------------------------------ */
/* Check-in                                                            */
/* ------------------------------------------------------------------ */

export type CheckInReason =
  | 'ok'
  | 'not_found'
  | 'already_used'
  | 'cancelled'
  | 'expired'
  | 'payment_pending'
  | 'payment_unverified'
  | 'not_confirmed'
  | 'wrong_event';

/** Why a booking may not be admitted, or null when it may. */
export function checkInBlock(booking: any, eventId?: string): { reason: CheckInReason; message: string } | null {
  if (eventId && String(booking.eventId ?? '') !== eventId) {
    return { reason: 'wrong_event', message: 'This ticket is for a different event' };
  }
  if (booking.status === 'cancelled') return { reason: 'cancelled', message: 'This ticket was cancelled' };
  if (booking.checkedIn === true) return { reason: 'already_used', message: 'Ticket already checked in' };
  if (booking.status === 'expired') {
    return { reason: 'expired', message: 'This booking expired before it was paid' };
  }
  if (booking.status === 'pending_payment') {
    return { reason: 'payment_pending', message: 'This booking has not been paid' };
  }
  if (booking.status !== 'confirmed') {
    return { reason: 'not_confirmed', message: 'This booking is not confirmed' };
  }
  const paid = effectivePaymentStatus(booking);
  if (paid === 'paid') return null;
  if (paid === 'unverified' && legacyUnverifiedAllowed()) return null;
  if (paid === 'unverified') {
    return { reason: 'payment_unverified', message: 'The payment for this ticket was never verified' };
  }
  return { reason: 'not_confirmed', message: 'This ticket is not paid' };
}

/** One-time check-in. Only one of any number of simultaneous calls gets `true`. */
export async function markCheckedIn(db: Db, booking: any, by: string): Promise<{ done: boolean; checkedInAt: Date }> {
  const checkedInAt = new Date();
  const result = await db.collection('bookings').updateOne(
    { _id: booking._id, checkedIn: { $ne: true }, status: 'confirmed' },
    { $set: { checkedIn: true, checkedInAt, checkedInBy: by, status: 'attended', updatedAt: checkedInAt } }
  );
  return { done: result.modifiedCount === 1, checkedInAt };
}

/* ------------------------------------------------------------------ */
/* Cancellation and refund request                                     */
/* ------------------------------------------------------------------ */

function refundDocument(
  booking: any,
  input: { amountPaid: number; quote: RefundQuote; reason: string; requestedBy: string }
): Record<string, any> {
  const now = new Date();
  return {
    bookingId: String(booking._id),
    service: 'ticketing',
    customerPhone: booking.userPhone || null,
    eventId: booking.eventId ? String(booking.eventId) : null,
    eventTitle: booking.eventTitle || '',
    payeeType: booking.payeeType || null,
    payeeId: booking.payeeId || null,
    paymentReference: booking.ledgerReference || null,
    gatewayPaymentId: booking.gatewayPaymentId || null,
    amountPaid: input.amountPaid,
    refundPercent: input.quote.refundPercent,
    deductionAmount: input.quote.deductionAmount,
    refundAmount: input.quote.refundAmount,
    ruleId: input.quote.ruleId,
    ruleSnapshot: input.quote.ruleSnapshot,
    reason: input.reason,
    requestedBy: input.requestedBy,
    status: 'requested',
    firstApprover: null,
    secondApprover: null,
    gatewayRefundId: null,
    processedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface CancellationQuote extends RefundQuote {
  amountPaid: number;
  /** Hours from now until the event starts; null when the start time cannot be read. */
  hoursBeforeEvent: number | null;
}

/** What the customer would get back if the booking were cancelled right now. */
export async function quoteCancellation(db: Db, booking: any): Promise<CancellationQuote> {
  const event = await findEvent(db, booking.eventId);
  const start = eventStart(event, booking);
  const hours = start ? Math.round(((start.getTime() - Date.now()) / 3600000) * 100) / 100 : null;
  const paidOnline = booking.paymentStatus === 'paid' && Boolean(booking.gatewayPaymentId);
  const amountPaid = paidOnline ? roundMoney(parseAmount(booking.amountPaid ?? booking.totalPrice)) : 0;

  const rule = amountPaid > 0 && hours !== null && hours >= 0 ? await findRefundRule(db, 'ticketing', hours) : null;
  const quote = quoteRefund(amountPaid, rule);

  let explanation = quote.explanation;
  if (amountPaid === 0) explanation = 'Nothing was paid online for this booking, so there is nothing to refund.';
  else if (hours === null) explanation = 'The start time of this event could not be read, so no refund can be offered automatically.';
  else if (hours < 0) explanation = 'The event has already started, so no refund is available.';

  return { ...quote, explanation, amountPaid, hoursBeforeEvent: hours };
}

/**
 * Cancels a booking, gives the seats back and, when a refund is due under the
 * rule in force, opens a refund request (status 'requested') for the finance
 * team to approve and pay. This function never moves money.
 */
export async function cancelBooking(
  db: Db,
  booking: any,
  input: { requestedBy: string; reason: string; allowAfterStart?: boolean }
): Promise<{ booking: any; quote: CancellationQuote; refund: any | null; alreadyCancelled: boolean }> {
  if (booking.status === 'cancelled') {
    const refund = await db.collection('refunds').findOne({ bookingId: String(booking._id) });
    const stored = booking.refundQuote || (await quoteCancellation(db, booking));
    return { booking, quote: stored, refund, alreadyCancelled: true };
  }
  if (booking.checkedIn === true || booking.status === 'attended') {
    throw new BookingError('This ticket has already been used and cannot be cancelled', 409, 'ALREADY_USED');
  }
  if (booking.status === 'expired') {
    throw new BookingError('This booking expired and holds no seats', 409, 'EXPIRED');
  }
  if (booking.status !== 'confirmed' && booking.status !== 'pending_payment') {
    throw new BookingError('This booking cannot be cancelled', 409, 'NOT_CANCELLABLE');
  }

  const quote = await quoteCancellation(db, booking);
  if (!input.allowAfterStart && quote.hoursBeforeEvent !== null && quote.hoursBeforeEvent < 0) {
    throw new BookingError('The event has already started, so this booking can no longer be cancelled', 409, 'EVENT_STARTED');
  }

  const now = new Date();
  const refundDue = quote.amountPaid > 0 && quote.refundAmount > 0;
  const refundQuote = { ...quote, quotedAt: now };
  const set: Record<string, any> = {
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: input.reason,
    cancelledBy: input.requestedBy,
    // The rule applied is kept on the booking as it stood at this moment.
    refundQuote,
    updatedAt: now,
  };
  if (refundDue) set.paymentStatus = 'refund_requested';

  const won = await db.collection('bookings').updateOne(
    { _id: booking._id, status: booking.status, checkedIn: { $ne: true } },
    { $set: set, $unset: { expiresAt: '' } }
  );
  if (won.modifiedCount !== 1) {
    throw new BookingError('This booking has just changed. Please reload and try again.', 409, 'CHANGED');
  }

  await releaseBooking(db, booking, 'cancelled');

  let refund: any = null;
  if (refundDue) {
    const doc = refundDocument(booking, {
      amountPaid: quote.amountPaid,
      quote,
      reason: input.reason,
      requestedBy: input.requestedBy,
    });
    const inserted = await db.collection('refunds').insertOne(doc);
    refund = { ...doc, _id: inserted.insertedId };
    await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { refundId: String(inserted.insertedId) } });
  }

  return {
    booking: await db.collection('bookings').findOne({ _id: booking._id }),
    quote: refundQuote,
    refund,
    alreadyCancelled: false,
  };
}
