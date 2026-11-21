import type { Db, ObjectId } from 'mongodb';
import { toObjectId } from '@/lib/http';

/**
 * Artist availability, shared by the artist app route
 * (/api/artist/availability) and the admin routes. Not a route itself.
 *
 * Collection `artistAvailability`, one document per artist per day:
 *   { artistId (text), date 'YYYY-MM-DD' (India date), status, note,
 *     updatedBy, updatedByRole ('artist' | 'admin'), reason, updatedAt }
 *
 * A day can be:
 *   available / unavailable   set by the artist in the app, or by an admin
 *   booked                    the artist has an accepted event on that day
 *                             (worked out from `events`, never stored), or an
 *                             admin marked the day as booked
 *   not_set                   nothing recorded for that day
 *
 * RULE: a day with an accepted event is always 'booked'. Neither the artist
 * nor an admin can record a different status for it, because the calendar
 * would then contradict the event.
 */

export const AVAILABILITY_STATUSES = ['available', 'unavailable', 'booked'] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];
export type DayStatus = AvailabilityStatus | 'not_set';

export const MAX_RANGE_DAYS = 92;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const IST_OFFSET_MS = 330 * 60000;
const DAY_MS = 86400000;

/** A real calendar day in YYYY-MM-DD form, or null. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== 'string' || !DAY.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

/** Today's date in India. */
export function todayInIndia(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, count: number): string {
  return new Date(new Date(day + 'T00:00:00.000Z').getTime() + count * DAY_MS).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to && out.length <= 400; day = addDays(day, 1)) out.push(day);
  return out;
}

/**
 * Reads a from/to pair. Returns a message when it cannot be used.
 * With nothing sent the range is today plus the next 30 days.
 */
export function readRange(fromValue: unknown, toValue: unknown): { from: string; to: string } | { error: string } {
  const today = todayInIndia();
  const from = fromValue === null || fromValue === undefined || fromValue === '' ? today : parseDay(fromValue);
  if (!from) return { error: 'from must be a date in YYYY-MM-DD format' };
  const to = toValue === null || toValue === undefined || toValue === '' ? addDays(from, 30) : parseDay(toValue);
  if (!to) return { error: 'to must be a date in YYYY-MM-DD format' };
  if (to < from) return { error: 'The end date is before the start date' };
  if (daysBetween(from, to).length > MAX_RANGE_DAYS) return { error: `A range can cover at most ${MAX_RANGE_DAYS} days` };
  return { from, to };
}

/** Event dates are stored as text. Only dates that can be read reliably count. */
function eventDay(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return parseDay(`${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`);
  const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (dmy) return parseDay(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`);
  return null;
}

export interface BookedEvent {
  _id: string;
  name: string;
  relation: 'invited' | 'created';
}

/**
 * Days on which the artist has an accepted event: an approved event that
 * lists the artist and that the artist accepted, or an approved event the
 * artist created. Multi-day events book every day from start to end.
 */
export async function eventBookedDays(db: Db, artistId: ObjectId, from: string, to: string): Promise<Map<string, BookedEvent[]>> {
  const ids = [artistId, String(artistId)];
  const events = await db
    .collection('events')
    .find(
      {
        status: 'approved',
        $or: [{ artists: { $in: ids }, artistResponse: 'accepted' }, { organizerId: { $in: ids } }],
      },
      { projection: { name: 1, startDate: 1, endDate: 1, organizerId: 1 } }
    )
    .limit(2000)
    .toArray();

  const booked = new Map<string, BookedEvent[]>();
  for (const event of events) {
    const start = eventDay(event.startDate);
    if (!start) continue;
    let end = eventDay(event.endDate) || start;
    if (end < start) end = start;
    // An event with a wrong end date must not block months of the calendar.
    if (daysBetween(start, end).length > 31) end = start;
    if (end < from || start > to) continue;
    const entry: BookedEvent = {
      _id: String(event._id),
      name: event.name || 'Untitled event',
      relation: String(event.organizerId || '') === String(artistId) ? 'created' : 'invited',
    };
    for (const day of daysBetween(start < from ? from : start, end > to ? to : end)) {
      booked.set(day, [...(booked.get(day) || []), entry]);
    }
  }
  return booked;
}

export interface CalendarDay {
  date: string;
  status: DayStatus;
  /** Where the status comes from. */
  source: 'event' | 'artist' | 'admin' | 'none';
  note: string;
  reason: string;
  events: BookedEvent[];
  updatedBy: string | null;
  updatedAt: Date | null;
}

/** One entry per day of the range, with accepted events applied on top of what is stored. */
export async function loadCalendar(db: Db, artistId: ObjectId, from: string, to: string): Promise<CalendarDay[]> {
  const [stored, booked] = await Promise.all([
    db
      .collection('artistAvailability')
      .find({ artistId: String(artistId), date: { $gte: from, $lte: to } })
      .toArray(),
    eventBookedDays(db, artistId, from, to),
  ]);
  const byDay = new Map(stored.map((row) => [String(row.date), row]));

  return daysBetween(from, to).map((date) => {
    const row = byDay.get(date);
    const events = booked.get(date) || [];
    const storedStatus: DayStatus = AVAILABILITY_STATUSES.includes(row?.status) ? row!.status : 'not_set';
    return {
      date,
      status: events.length ? 'booked' : storedStatus,
      source: events.length ? 'event' : row ? (row.updatedByRole === 'admin' ? 'admin' : 'artist') : 'none',
      note: row?.note || '',
      reason: row?.reason || '',
      events,
      updatedBy: row?.updatedBy || null,
      updatedAt: row?.updatedAt || null,
    };
  });
}

export function summarise(days: CalendarDay[]) {
  const summary = { available: 0, unavailable: 0, booked: 0, not_set: 0 };
  for (const day of days) summary[day.status] += 1;
  return summary;
}

let indexReady: Promise<unknown> | null = null;

/** One document per artist per day, enforced by the database. */
export function ensureAvailabilityIndex(db: Db) {
  if (!indexReady) {
    indexReady = db
      .collection('artistAvailability')
      .createIndex({ artistId: 1, date: 1 }, { unique: true, name: 'one_row_per_artist_day' })
      .catch((error) => {
        indexReady = null;
        console.error('Could not create the availability index:', error?.message || error);
      });
  }
  return indexReady;
}

export interface DayChange {
  date: string;
  status: AvailabilityStatus | 'clear';
  note: string;
}

/**
 * Reads the days a caller wants to set. Two shapes are accepted:
 *   { days: [{ date, status, note }] }
 *   { dates: ['YYYY-MM-DD', ...], status, note }
 * `allowed` lists the statuses this caller may set.
 */
export function readChanges(body: any, allowed: readonly string[]): { changes: DayChange[] } | { error: string } {
  const raw: any[] = Array.isArray(body?.days)
    ? body.days
    : Array.isArray(body?.dates)
    ? body.dates.map((date: unknown) => ({ date, status: body.status, note: body.note }))
    : [];
  if (raw.length === 0) return { error: 'Send the days to set' };
  if (raw.length > MAX_RANGE_DAYS) return { error: `At most ${MAX_RANGE_DAYS} days can be set in one request` };

  const seen = new Set<string>();
  const changes: DayChange[] = [];
  for (const entry of raw) {
    const date = parseDay(entry?.date);
    if (!date) return { error: 'Every day needs a date in YYYY-MM-DD format' };
    if (seen.has(date)) return { error: `${date} was sent twice` };
    seen.add(date);
    const status = typeof entry?.status === 'string' ? entry.status : '';
    if (!allowed.includes(status)) return { error: `status must be one of: ${allowed.join(', ')}` };
    const note = typeof entry?.note === 'string' ? entry.note.trim().slice(0, 300) : '';
    changes.push({ date, status: status as DayChange['status'], note });
  }
  return { changes };
}

/**
 * Stores the changes. Returns the days that were refused because the artist
 * has an accepted event on them; when any day is refused nothing is written.
 */
export async function applyChanges(args: {
  db: Db;
  artistId: ObjectId;
  changes: DayChange[];
  by: string;
  role: 'artist' | 'admin';
  reason?: string;
}): Promise<{ refused: { date: string; events: BookedEvent[] }[]; locked: string[]; before: Record<string, string>; after: Record<string, string> }> {
  const { db, artistId, changes, by, role, reason } = args;
  await ensureAvailabilityIndex(db);

  const dates = changes.map((change) => change.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const wanted = new Set(dates);

  const [booked, stored] = await Promise.all([
    eventBookedDays(db, artistId, from, to),
    db
      .collection('artistAvailability')
      .find({ artistId: String(artistId), date: { $in: dates } })
      .toArray(),
  ]);
  const storedByDay = new Map(stored.map((row) => [String(row.date), row]));

  const refused = Array.from(booked.entries())
    .filter(([date]) => wanted.has(date))
    .map(([date, events]) => ({ date, events }))
    .sort((a, b) => a.date.localeCompare(b.date));
  // A day an admin marked as booked stays booked until an admin changes it.
  const locked = role === 'artist' ? dates.filter((date) => storedByDay.get(date)?.status === 'booked') : [];
  if (refused.length || locked.length) return { refused, locked, before: {}, after: {} };

  const now = new Date();
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  const operations: any[] = [];
  for (const change of changes) {
    const previous = storedByDay.get(change.date);
    const previousStatus = previous?.status || 'not_set';
    const nextStatus = change.status === 'clear' ? 'not_set' : change.status;
    if (previousStatus === nextStatus && (previous?.note || '') === change.note) continue;
    before[change.date] = previousStatus;
    after[change.date] = nextStatus;
    if (change.status === 'clear') {
      operations.push({ deleteOne: { filter: { artistId: String(artistId), date: change.date } } });
    } else {
      operations.push({
        updateOne: {
          filter: { artistId: String(artistId), date: change.date },
          update: {
            $set: {
              status: change.status,
              note: change.note,
              reason: role === 'admin' ? reason || '' : '',
              updatedBy: by,
              updatedByRole: role,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          upsert: true,
        },
      });
    }
  }
  if (operations.length) await db.collection('artistAvailability').bulkWrite(operations, { ordered: true });
  return { refused: [], locked: [], before, after };
}

export { toObjectId };
