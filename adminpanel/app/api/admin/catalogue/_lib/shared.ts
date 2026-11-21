import bcrypt from 'bcryptjs';
import type { Db, ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { getAdminFromRequest, requireAdmin, type AdminTokenPayload } from '@/lib/auth';
import { asString, fail, parseAmount, toObjectId } from '@/lib/http';

/**
 * Server-side helpers shared by the event, venue and catalogue routes.
 * This folder starts with an underscore, so Next.js does not route to it.
 */

/* ------------------------------------------------------------------ */
/* Who is calling                                                      */
/* ------------------------------------------------------------------ */

export type Caller =
  | { kind: 'anonymous' }
  | { kind: 'admin'; admin: AdminTokenPayload }
  | { kind: 'denied'; response: Response };

/**
 * Routes that serve both the apps (no login) and the admin panel use this for
 * writes. A request without an admin token is anonymous. A request with an
 * admin token must hold the permission and a live session, otherwise it is
 * refused rather than quietly treated as anonymous.
 */
export async function identifyCaller(request: NextRequest, permission: string): Promise<Caller> {
  if (!getAdminFromRequest(request)) return { kind: 'anonymous' };
  const check = await requireAdmin(request, permission);
  if (!check.ok) return { kind: 'denied', response: check.response };
  return { kind: 'admin', admin: check.admin };
}

/* ------------------------------------------------------------------ */
/* Uploads stored as base64 inside documents                           */
/* ------------------------------------------------------------------ */

export const MAX_IMAGE_CHARS = 1_500_000;
export const MAX_VIDEO_CHARS = 3_000_000;
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i;

/**
 * Checks one uploaded file sent as a data URL (or an http link).
 * Returns a ready 4xx response when it cannot be stored, otherwise null.
 */
export function mediaProblem(value: unknown, label: string, options: { allowVideo?: boolean } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return fail(`${label} must be sent as text`, 400);

  if (/^https?:\/\//i.test(value)) {
    return value.length > 2000 ? fail(`${label} link is too long`, 400) : null;
  }

  if (/^data:video\//i.test(value)) {
    if (!options.allowVideo) return fail(`${label} must be an image`, 400);
    if (value.length > MAX_VIDEO_CHARS) {
      return fail(
        `${label} is too large to save. Videos are stored inside the database record, which only works up to about 2 MB. ` +
          'Larger videos need a file store (for example S3 or Cloudinary), which is not set up yet. Use a shorter clip or an image.',
        413
      );
    }
    return null;
  }

  if (!IMAGE_DATA_URL.test(value)) {
    return fail(`${label} is not a supported file. Use PNG, JPG, WEBP, GIF or SVG.`, 400);
  }
  if (value.length > MAX_IMAGE_CHARS) {
    return fail(`${label} is too large. Images must be about 1 MB or smaller (1.5 MB after encoding).`, 413);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Scanner staff                                                       */
/* ------------------------------------------------------------------ */

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function isPasswordHash(value: unknown): boolean {
  return typeof value === 'string' && BCRYPT_HASH.test(value);
}

/**
 * Prepares scanner staff for storage: passwords are always stored as bcrypt
 * hashes. An entry sent without a password keeps the stored hash of the staff
 * member with the same email, which is how an admin edits a name or phone.
 */
export async function prepareStaff(input: unknown, existing: any[] = []): Promise<any[]> {
  if (!Array.isArray(input)) return [];
  const out: any[] = [];

  for (const raw of input.slice(0, 50)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = asString(raw.name, 120);
    const email = asString(raw.email, 200);
    if (!name || !email) continue;

    const previous = existing.find((s) => s && s.email === email);
    const sent = typeof raw.password === 'string' ? raw.password.slice(0, 200) : '';

    let password: string | null = null;
    if (sent) password = await bcrypt.hash(sent, 10);
    else if (previous?.password) {
      password = isPasswordHash(previous.password) ? previous.password : await bcrypt.hash(String(previous.password), 10);
    }

    out.push({ name, email, phone: asString(raw.phone, 30), password });
  }
  return out;
}

/** Staff as shown to the public and in the admin panel: names only. */
export function staffNames(list: unknown): { name: string }[] {
  if (!Array.isArray(list)) return [];
  return list.filter((s) => s && typeof s === 'object').map((s: any) => ({ name: s.name || '' }));
}

/** Staff as shown to the organiser who created them: no password. */
export function staffContacts(list: unknown): { name: string; email: string; phone: string }[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && typeof s === 'object')
    .map((s: any) => ({ name: s.name || '', email: s.email || '', phone: s.phone || '' }));
}

/* ------------------------------------------------------------------ */
/* Event responses                                                     */
/* ------------------------------------------------------------------ */

/** Fields of an organiser or artist that are safe to show to anyone. */
export const PUBLIC_PERSON_PROJECTION = {
  name: 1,
  profileImage: 1,
  kycStatus: 1,
  city: 1,
  genre: 1,
  bio: 1,
  followersCount: 1,
  followers: 1,
  totalEvents: 1,
} as const;

export function publicPerson(doc: any) {
  if (!doc || typeof doc !== 'object') return doc ?? null;
  const out: Record<string, any> = { _id: doc._id };
  for (const key of Object.keys(PUBLIC_PERSON_PROJECTION)) {
    if (doc[key] !== undefined) out[key] = doc[key];
  }
  return out;
}

/** Event fields that name the admin who reviewed or changed it. Never sent to the apps. */
const ADMIN_IDENTITY_FIELDS = ['reviewedBy', 'scheduleChangedBy', 'statusChangedBy', 'updatedBy', 'createdBy', 'ticketsChangedBy'];

/**
 * Removes everything an event response must never carry: staff passwords,
 * the admins who reviewed or changed the event, and the private parts of
 * looked-up organiser and artist documents.
 */
export function sanitiseEvent(event: any, staff: 'names' | 'contacts' = 'names') {
  if (!event || typeof event !== 'object') return event;
  const out: Record<string, any> = { ...event };

  // The joining link of an online event is for ticket holders, not for everyone
  // who can read the public event. Only the organiser's own list keeps it.
  if (staff !== 'contacts' && out.onlineDetails && typeof out.onlineDetails === 'object') {
    out.onlineDetails = { hasLink: Boolean(out.onlineDetails.link) };
  }

  if ('scannerStaff' in out) {
    out.scannerStaff = staff === 'contacts' ? staffContacts(out.scannerStaff) : staffNames(out.scannerStaff);
  }

  // Which admin reviewed or changed the event (or its looked-up venue) is
  // internal: the apps and the website never receive admin email addresses.
  for (const key of ADMIN_IDENTITY_FIELDS) delete out[key];
  for (const nested of ['venue', 'venueDetails']) {
    if (out[nested] && typeof out[nested] === 'object' && !Array.isArray(out[nested])) {
      out[nested] = { ...out[nested] };
      for (const key of ADMIN_IDENTITY_FIELDS) delete out[nested][key];
    }
  }
  if (out.organizer && typeof out.organizer === 'object') out.organizer = publicPerson(out.organizer);
  if (out.artist && typeof out.artist === 'object') out.artist = publicPerson(out.artist);
  if (Array.isArray(out.artistDetails)) out.artistDetails = out.artistDetails.map(publicPerson);

  return out;
}

/** Venue lookup that survives events whose `venue` is free text rather than an id. */
export const VENUE_LOOKUP_STAGES = [
  {
    $lookup: {
      from: 'venues',
      let: { venueId: { $convert: { input: '$venue', to: 'objectId', onError: null, onNull: null } } },
      pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$venueId'] } } }],
      as: 'venueDetails',
    },
  },
  { $unwind: { path: '$venueDetails', preserveNullAndEmptyArrays: true } },
];

/* ------------------------------------------------------------------ */
/* Tickets                                                             */
/* ------------------------------------------------------------------ */

export function ticketKey(ticket: any): string {
  return `${String(ticket?.name ?? '').trim().toLowerCase()}|${String(ticket?.blockName ?? '').trim().toLowerCase()}`;
}

export function ticketCount(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? '').replace(/[^0-9\-]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface TicketSummary {
  name: string;
  blockName: string;
  price: number;
  quantity: number;
  sold: number;
  remaining: number;
  startSeat: any;
  endSeat: any;
}

export function summariseTickets(tickets: unknown): TicketSummary[] {
  if (!Array.isArray(tickets)) return [];
  return tickets
    .filter((t) => t && typeof t === 'object')
    .map((t: any) => {
      const quantity = ticketCount(t.quantity);
      const sold = ticketCount(t.sold);
      return {
        name: String(t.name ?? ''),
        blockName: String(t.blockName ?? ''),
        price: parseAmount(t.price),
        quantity,
        sold,
        remaining: Math.max(0, quantity - sold),
        startSeat: t.startSeat ?? null,
        endSeat: t.endSeat ?? null,
      };
    });
}

/**
 * Builds the ticket list to store when a caller replaces an event's tickets.
 * The stored `sold` value of each ticket is kept; a caller can never set it.
 * Returns a message when the change would lose sales.
 */
export function mergeTickets(incoming: unknown, stored: unknown): { tickets?: any[]; error?: string; status?: number } {
  if (!Array.isArray(incoming)) return { error: 'tickets must be an array', status: 400 };
  if (incoming.length > 200) return { error: 'Too many ticket categories', status: 400 };

  const current = Array.isArray(stored) ? stored.filter((t) => t && typeof t === 'object') : [];
  const byKey = new Map<string, any>();
  for (const ticket of current) if (!byKey.has(ticketKey(ticket))) byKey.set(ticketKey(ticket), ticket);

  const seen = new Set<string>();
  const tickets: any[] = [];

  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Each ticket must be an object', status: 400 };
    if (Object.keys(raw).some((k) => k.startsWith('$') || k.includes('.'))) {
      return { error: 'Ticket has an invalid field name', status: 400 };
    }
    const key = ticketKey(raw);
    if (seen.has(key)) {
      return { error: `Two tickets share the name "${raw.name ?? ''}" and block "${raw.blockName ?? ''}"`, status: 400 };
    }
    seen.add(key);

    const previous = byKey.get(key);
    const sold = previous ? previous.sold ?? '0' : '0';
    if (previous && ticketCount(raw.quantity) < ticketCount(previous.sold)) {
      return {
        error: `"${raw.name ?? ''}" already has ${ticketCount(previous.sold)} tickets sold, so its quantity cannot be lower than that.`,
        status: 409,
      };
    }
    tickets.push({ ...raw, sold });
  }

  for (const [key, ticket] of Array.from(byKey.entries())) {
    if (!seen.has(key) && ticketCount(ticket.sold) > 0) {
      return {
        error: `"${ticket.name ?? ''}" has ${ticketCount(ticket.sold)} tickets sold and cannot be removed or renamed.`,
        status: 409,
      };
    }
  }

  return { tickets };
}

/* ------------------------------------------------------------------ */
/* Bookings of an event                                                */
/* ------------------------------------------------------------------ */

/** Bookings store `eventId` as text; a few old rows hold an ObjectId. */
export function eventIdMatch(id: ObjectId) {
  return { $in: [String(id), id] };
}

export function seatsOf(booking: any): number {
  const total = ticketCount(booking?.totalSeats);
  if (total > 0) return total;
  if (Array.isArray(booking?.tickets)) {
    return booking.tickets.reduce((sum: number, t: any) => sum + ticketCount(t?.quantity), 0);
  }
  return 0;
}

export interface EventBookingStats {
  bookings: number;
  confirmedBookings: number;
  confirmedSeats: number;
  checkedInSeats: number;
  cancelledBookings: number;
}

export async function bookingStatsForEvent(db: Db, id: ObjectId): Promise<EventBookingStats> {
  const rows = await db
    .collection('bookings')
    .find({ eventId: eventIdMatch(id) }, { projection: { status: 1, checkedIn: 1, totalSeats: 1, 'tickets.quantity': 1 } })
    .toArray();

  const stats: EventBookingStats = { bookings: rows.length, confirmedBookings: 0, confirmedSeats: 0, checkedInSeats: 0, cancelledBookings: 0 };
  for (const row of rows) {
    const seats = seatsOf(row);
    if (row.status === 'confirmed' || row.status === 'attended') {
      stats.confirmedBookings += 1;
      stats.confirmedSeats += seats;
    }
    if (row.status === 'cancelled') stats.cancelledBookings += 1;
    if (row.checkedIn === true) stats.checkedInSeats += seats;
  }
  return stats;
}

/* ------------------------------------------------------------------ */
/* Venues                                                              */
/* ------------------------------------------------------------------ */

export function readAmenities(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of list) {
    const text = asString(entry, 60);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= 40) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Banners and sponsored ads                                           */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Parses a date sent by a form. Returns undefined when it is not a date. */
export function readDate(value: unknown): Date | null | undefined {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * What a banner or ad is doing right now. The end date is inclusive: an item
 * that ends on the 10th is shown for the whole of the 10th.
 */
export function placementState(doc: any, now = new Date()): 'active' | 'inactive' | 'scheduled' | 'expired' {
  const end = toDate(doc?.endDate);
  if (end && end.getTime() + DAY_MS <= now.getTime()) return 'expired';
  if ((doc?.status || 'active') !== 'active') return 'inactive';
  const start = toDate(doc?.startDate);
  if (start && start.getTime() > now.getTime()) return 'scheduled';
  return 'active';
}

export function readPositiveInt(value: unknown, fallback: number, max = 100000): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(max, Math.floor(n));
}

export { toObjectId };
