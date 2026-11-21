import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { fail, ok, parseAmount, toObjectId } from '@/lib/http';
import { csvDownload, exportFilename, istDateTime, istDay, resolveRange, type DateRange } from '@/lib/reporting';
import { REPORT_TIMEZONE_LABEL } from '@/lib/resources/reports';
import { seatsOf } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

/**
 * Ticketing report (requirements section 5).
 *
 * GET /api/admin/ticketing/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=...
 *   groupBy  venue | event | location | day   read from `bookings`
 *            show                             read from `cinemaShows`
 *   preset   today | 7d | month | year (instead of from/to)
 *   export   csv
 *
 * The date range selects bookings by the day they were MADE (India time), and
 * cinema shows by the day of the show.
 *
 *   bookings        every booking made in the range, whatever happened to it
 *   sold            bookings that are confirmed or attended
 *   seats, value    seats and ticket price of the sold bookings
 *   cancellations   cancelled bookings (with their seats and value)
 *   check-ins       seats on bookings scanned at the gate
 *   unpaid          bookings still waiting for payment, or expired unpaid
 *
 * `check` holds the same totals counted a second time by the database itself,
 * straight from the raw documents with no grouping, so the two can be compared.
 */

const GROUPS = ['venue', 'event', 'show', 'location', 'day'] as const;
type GroupBy = (typeof GROUPS)[number];

const GROUP_LABEL: Record<GroupBy, string> = {
  venue: 'Venue',
  event: 'Event',
  show: 'Cinema show',
  location: 'City and state',
  day: 'Day',
};

const SOLD = ['confirmed', 'attended'];
const UNPAID = ['pending_payment', 'expired'];
const MAX_BOOKINGS = 200000;

interface Measures {
  bookings: number;
  sold: number;
  seats: number;
  value: number;
  cancellations: number;
  cancelledSeats: number;
  cancelledValue: number;
  checkIns: number;
  unpaid: number;
}

const emptyMeasures = (): Measures => ({
  bookings: 0,
  sold: 0,
  seats: 0,
  value: 0,
  cancellations: 0,
  cancelledSeats: 0,
  cancelledValue: 0,
  checkIns: 0,
  unpaid: 0,
});

const MEASURE_KEYS = Object.keys(emptyMeasures()) as (keyof Measures)[];
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function addBooking(target: Measures, booking: any) {
  const seats = seatsOf(booking);
  const value = parseAmount(booking.totalPrice);
  target.bookings += 1;
  if (SOLD.includes(booking.status)) {
    target.sold += 1;
    target.seats += seats;
    target.value += value;
  } else if (booking.status === 'cancelled') {
    target.cancellations += 1;
    target.cancelledSeats += seats;
    target.cancelledValue += value;
  } else if (UNPAID.includes(booking.status)) {
    target.unpaid += 1;
  }
  if (booking.checkedIn === true) target.checkIns += seats;
}

function roundMeasures(measures: Measures): Measures {
  return { ...measures, value: money(measures.value), cancelledValue: money(measures.cancelledValue) };
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

interface EventInfo {
  name: string;
  startDate: string;
  venueKey: string;
  venueName: string;
  managedVenue: boolean;
  city: string;
  state: string;
}

async function loadEvents(db: Db, eventIds: string[]): Promise<Map<string, EventInfo>> {
  const oids = eventIds.map((id) => toObjectId(id)).filter(Boolean) as any[];
  const events = oids.length
    ? await db
        .collection('events')
        .find({ _id: { $in: oids } }, { projection: { name: 1, startDate: 1, venue: 1, location: 1 } })
        .toArray()
    : [];

  const venueIds = events.map((event) => toObjectId(event.venue)).filter(Boolean) as any[];
  const venues = venueIds.length
    ? await db.collection('venues').find({ _id: { $in: venueIds } }, { projection: { name: 1, location: 1 } }).toArray()
    : [];
  const venueById = new Map(venues.map((venue) => [String(venue._id), venue]));

  const info = new Map<string, EventInfo>();
  for (const event of events) {
    const venue = toObjectId(event.venue) ? venueById.get(String(event.venue)) : undefined;
    const location = event.location && typeof event.location === 'object' ? event.location : {};
    const typed = typeof event.venue === 'string' && !toObjectId(event.venue) ? event.venue.trim() : '';
    const venueName = String(venue?.name || location.name || typed || '').trim();
    info.set(String(event._id), {
      name: event.name || 'Untitled event',
      startDate: typeof event.startDate === 'string' ? event.startDate : '',
      venueKey: venue ? 'venue:' + String(venue._id) : 'text:' + venueName.toLowerCase(),
      venueName,
      managedVenue: Boolean(venue),
      city: String(location.city || venue?.location?.city || '').trim(),
      state: String(location.state || venue?.location?.state || '').trim(),
    });
  }
  return info;
}

async function bookingReport(db: Db, range: DateRange, groupBy: Exclude<GroupBy, 'show'>) {
  const filter = { createdAt: { $gte: range.start, $lt: range.end } };
  const bookings = await db
    .collection('bookings')
    .find(filter, {
      projection: { eventId: 1, eventTitle: 1, venue: 1, status: 1, totalSeats: 1, totalPrice: 1, 'tickets.quantity': 1, checkedIn: 1, createdAt: 1 },
    })
    .limit(MAX_BOOKINGS + 1)
    .toArray();
  const truncated = bookings.length > MAX_BOOKINGS;
  if (truncated) bookings.length = MAX_BOOKINGS;

  const events = await loadEvents(db, Array.from(new Set(bookings.map((b) => String(b.eventId || '')).filter(Boolean))));

  const groups = new Map<string, { label: string; detail: string; link: string | null; measures: Measures }>();
  const totals = emptyMeasures();

  for (const booking of bookings) {
    const eventId = String(booking.eventId || '');
    const event = events.get(eventId);
    let key: string;
    let label: string;
    let detail = '';
    let link: string | null = null;

    if (groupBy === 'event') {
      key = eventId || 'none';
      label = event?.name || booking.eventTitle || 'Event not recorded';
      detail = event ? [event.startDate, event.venueName, event.city].filter(Boolean).join(' · ') : 'This event no longer exists';
      link = event ? `/events/${eventId}` : null;
    } else if (groupBy === 'venue') {
      const name = event?.venueName || (typeof booking.venue === 'string' ? booking.venue.trim() : '');
      key = event ? event.venueKey : 'text:' + name.toLowerCase();
      label = name || 'No venue recorded';
      detail = event?.managedVenue ? [event.city, event.state].filter(Boolean).join(', ') : name ? 'Typed in by the organiser, not a managed venue' : '';
      link = event?.managedVenue ? `/venues/${event.venueKey.slice(6)}` : null;
    } else if (groupBy === 'location') {
      const city = event?.city || '';
      const state = event?.state || '';
      key = `${city.toLowerCase()}|${state.toLowerCase()}`;
      label = city || 'No city recorded';
      detail = state || (city ? 'State not recorded on the event or venue' : '');
    } else {
      key = booking.createdAt instanceof Date ? istDay(booking.createdAt) : 'unknown';
      label = key;
    }

    if (!groups.has(key)) groups.set(key, { label, detail, link, measures: emptyMeasures() });
    addBooking(groups.get(key)!.measures, booking);
    addBooking(totals, booking);
  }

  const rows = Array.from(groups.entries()).map(([key, group]) => ({
    key,
    label: group.label,
    detail: group.detail,
    link: group.link,
    ...roundMeasures(group.measures),
  }));
  if (groupBy === 'day') rows.sort((a, b) => a.key.localeCompare(b.key));
  else rows.sort((a, b) => b.value - a.value || b.bookings - a.bookings || a.label.localeCompare(b.label));

  return { rows, totals: roundMeasures(totals), check: await independentBookingCount(db, filter), truncated };
}

/**
 * The same totals counted by the database from the raw booking documents: one
 * $group over everything in the range, sharing no code with the grouped report.
 */
async function independentBookingCount(db: Db, filter: Record<string, any>): Promise<Measures> {
  const number = (input: any) => ({ $convert: { input, to: 'double', onError: 0, onNull: 0 } });
  // totalPrice is a number on bookings; text such as "₹1,500.00" on old rows is cleaned first.
  const price = {
    $cond: [
      { $eq: [{ $type: '$totalPrice' }, 'string'] },
      number({ $replaceAll: { input: { $replaceAll: { input: { $replaceAll: { input: '$totalPrice', find: '₹', replacement: '' } }, find: ',', replacement: '' } }, find: ' ', replacement: '' } }),
      number('$totalPrice'),
    ],
  };
  const lineSeats = {
    $sum: {
      $map: { input: { $cond: [{ $isArray: '$tickets' }, '$tickets', []] }, as: 't', in: { $max: [0, { $floor: number('$$t.quantity') }] } },
    },
  };
  const seats = { $cond: [{ $gt: [{ $floor: number('$totalSeats') }, 0] }, { $floor: number('$totalSeats') }, lineSeats] };
  const when = (condition: any, value: any) => ({ $sum: { $cond: [condition, value, 0] } });
  const isSold = { $in: ['$status', SOLD] };
  const isCancelled = { $eq: ['$status', 'cancelled'] };

  const [row] = await db
    .collection('bookings')
    .aggregate([
      { $match: filter },
      { $limit: MAX_BOOKINGS },
      { $project: { status: 1, checkedIn: 1, seats, price } },
      {
        $group: {
          _id: null,
          bookings: { $sum: 1 },
          sold: when(isSold, 1),
          seats: when(isSold, '$seats'),
          value: when(isSold, '$price'),
          cancellations: when(isCancelled, 1),
          cancelledSeats: when(isCancelled, '$seats'),
          cancelledValue: when(isCancelled, '$price'),
          checkIns: when({ $eq: ['$checkedIn', true] }, '$seats'),
          unpaid: when({ $in: ['$status', UNPAID] }, 1),
        },
      },
    ])
    .toArray();

  const out = emptyMeasures();
  if (row) for (const key of MEASURE_KEYS) out[key] = Number(row[key]) || 0;
  return roundMeasures(out);
}

/* ------------------------------------------------------------------ */
/* Cinema shows                                                        */
/* ------------------------------------------------------------------ */

async function showReport(db: Db, range: DateRange) {
  // `showAt` is stored as a date by the resource screens; older rows may hold text.
  const filter = {
    $or: [
      { showAt: { $gte: range.start, $lt: range.end } },
      { showAt: { $gte: range.start.toISOString(), $lt: range.end.toISOString() } },
    ],
  };
  const shows = await db.collection('cinemaShows').find(filter).sort({ showAt: 1 }).limit(20000).toArray();
  const cinemaIds = Array.from(new Set(shows.map((show) => String(show.cinemaId || '')))).map((id) => toObjectId(id)).filter(Boolean) as any[];
  const cinemas = cinemaIds.length
    ? await db.collection('cinemas').find({ _id: { $in: cinemaIds } }, { projection: { name: 1, city: 1, state: 1 } }).toArray()
    : [];
  const cinemaById = new Map(cinemas.map((cinema) => [String(cinema._id), cinema]));

  const whole = (value: unknown) => {
    const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };

  const totals = { shows: 0, cancelledShows: 0, totalSeats: 0, seatsSold: 0, value: 0 };
  const rows = shows.map((show) => {
    const cinema = cinemaById.get(String(show.cinemaId || ''));
    const totalSeats = whole(show.totalSeats);
    const seatsSold = whole(show.seatsSold);
    const basePrice = parseAmount(show.basePrice);
    const cancelled = show.status === 'cancelled';
    const value = money(seatsSold * basePrice);
    totals.shows += 1;
    if (cancelled) totals.cancelledShows += 1;
    totals.totalSeats += totalSeats;
    totals.seatsSold += seatsSold;
    totals.value += value;
    return {
      key: String(show._id),
      label: show.title || 'Untitled show',
      detail: [cinema?.name || 'Cinema not found', show.screen, [cinema?.city, cinema?.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
      link: cinema ? `/cinemas/${String(cinema._id)}` : null,
      showAt: show.showAt || null,
      status: show.status || 'scheduled',
      totalSeats,
      seatsSold,
      remaining: Math.max(0, totalSeats - seatsSold),
      basePrice,
      value,
    };
  });
  totals.value = money(totals.value);

  // Independent count, by the database.
  const number = (input: any) => ({ $max: [0, { $floor: { $convert: { input, to: 'double', onError: 0, onNull: 0 } } }] });
  const [raw] = await db
    .collection('cinemaShows')
    .aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          shows: { $sum: 1 },
          cancelledShows: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          totalSeats: { $sum: number('$totalSeats') },
          seatsSold: { $sum: number('$seatsSold') },
          value: { $sum: { $multiply: [number('$seatsSold'), { $convert: { input: '$basePrice', to: 'double', onError: 0, onNull: 0 } }] } },
        },
      },
    ])
    .toArray();
  const check = {
    shows: Number(raw?.shows) || 0,
    cancelledShows: Number(raw?.cancelledShows) || 0,
    totalSeats: Number(raw?.totalSeats) || 0,
    seatsSold: Number(raw?.seatsSold) || 0,
    value: money(Number(raw?.value) || 0),
  };

  return { rows, totals, check };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

function csvCell(value: any): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? istDateTime(value) : String(value);
  // Neutralise spreadsheet formulas in text cells; plain numbers are left alone.
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

const csvLine = (...cells: any[]) => cells.map(csvCell).join(',');

const BOOKING_COLUMNS: { key: keyof Measures; label: string; money?: boolean }[] = [
  { key: 'bookings', label: 'Bookings made' },
  { key: 'sold', label: 'Sold bookings' },
  { key: 'seats', label: 'Seats sold' },
  { key: 'value', label: 'Sales value (INR)', money: true },
  { key: 'cancellations', label: 'Cancelled bookings' },
  { key: 'cancelledSeats', label: 'Cancelled seats' },
  { key: 'cancelledValue', label: 'Cancelled value (INR)', money: true },
  { key: 'checkIns', label: 'Seats checked in' },
  { key: 'unpaid', label: 'Unpaid or expired bookings' },
];

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'bookings:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  const groupParam = params.get('groupBy') || 'event';
  if (!(GROUPS as readonly string[]).includes(groupParam)) return fail('groupBy must be venue, event, show, location or day', 400);
  const groupBy = groupParam as GroupBy;

  const range = resolveRange(params, 'month');
  if (typeof range === 'string') return fail(range, 400);

  try {
    const { db } = await connectToDatabase();
    const generatedAt = new Date();
    const exporting = params.get('export') === 'csv';
    const head = [
      csvLine('Report', `Ticketing report by ${GROUP_LABEL[groupBy].toLowerCase()}`),
      csvLine('Date range', range.label),
      csvLine('Timezone', REPORT_TIMEZONE_LABEL),
      csvLine('Generated at', istDateTime(generatedAt) + ' IST'),
      csvLine('Generated by', check.admin.email || ''),
    ];

    if (groupBy === 'show') {
      const report = await showReport(db, range);
      const matches = JSON.stringify(report.totals) === JSON.stringify(report.check);

      if (exporting) {
        const lines = [
          ...head,
          csvLine('Dates', 'Shows are selected by the day of the show'),
          csvLine('Note', 'Seats sold is the figure typed in for each show on the Cinema Shows screen. Cinema tickets are not sold through the apps, so there are no bookings, cancellations or check-ins for shows.'),
          csvLine('Note', 'Value is seats sold multiplied by the base price of the show.'),
          csvLine('Check', `Independent count from the raw records: ${report.check.shows} shows, ${report.check.seatsSold} seats sold, value ${report.check.value.toFixed(2)}. ${matches ? 'Matches the totals below.' : 'DOES NOT MATCH the totals below.'}`),
          '',
          csvLine('Show', 'Cinema, screen and place', 'Show time (IST)', 'Status', 'Total seats', 'Seats sold', 'Remaining', 'Base price (INR)', 'Value at base price (INR)'),
          ...report.rows.map((row) =>
            csvLine(row.label, row.detail, row.showAt ? istDateTime(row.showAt) : '', row.status, row.totalSeats, row.seatsSold, row.remaining, row.basePrice.toFixed(2), row.value.toFixed(2))
          ),
          csvLine('Total', `${report.totals.shows} ${report.totals.shows === 1 ? 'show' : 'shows'}`, '', `${report.totals.cancelledShows} cancelled`, report.totals.totalSeats, report.totals.seatsSold, Math.max(0, report.totals.totalSeats - report.totals.seatsSold), '', report.totals.value.toFixed(2)),
        ];
        await logAudit({
          admin: check.admin,
          action: 'export',
          module: 'bookings',
          entityType: 'ticketing-report',
          entityLabel: `Ticketing report by ${GROUP_LABEL[groupBy].toLowerCase()}`,
          meta: { groupBy, from: range.from, to: range.to, rows: report.rows.length },
          request,
        });
        return csvDownload(lines.join('\r\n'), exportFilename('ticketing report by cinema show', range.label));
      }

      return ok({
        kind: 'shows',
        groupBy,
        groupLabel: GROUP_LABEL[groupBy],
        range: { from: range.from, to: range.to, label: range.label, preset: range.preset },
        timezone: REPORT_TIMEZONE_LABEL,
        generatedAt,
        rows: report.rows,
        totals: report.totals,
        check: report.check,
        matches,
      });
    }

    const report = await bookingReport(db, range, groupBy);
    const matches = MEASURE_KEYS.every((key) => report.totals[key] === report.check[key]);

    if (exporting) {
      const lines = [
        ...head,
        csvLine('Dates', 'Bookings are selected by the day they were made'),
        csvLine('Definition: Sold', 'Bookings that are confirmed or attended. Seats sold and sales value count these bookings only.'),
        csvLine('Definition: Cancelled', 'Bookings cancelled by the customer or an admin, with their seats and ticket price.'),
        csvLine('Definition: Checked in', 'Seats on bookings scanned at the gate.'),
        csvLine(
          'Check',
          `Independent count from the raw booking records: ${BOOKING_COLUMNS.map((c) => `${c.label} ${c.money ? report.check[c.key].toFixed(2) : report.check[c.key]}`).join('; ')}. ${
            matches ? 'Matches the totals below.' : 'DOES NOT MATCH the totals below.'
          }`
        ),
        ...(report.truncated ? [csvLine('Note', `Only the first ${MAX_BOOKINGS} bookings in the range were read. Choose a shorter range.`)] : []),
        '',
        csvLine(GROUP_LABEL[groupBy], 'Details', ...BOOKING_COLUMNS.map((c) => c.label)),
        ...report.rows.map((row) => csvLine(row.label, row.detail, ...BOOKING_COLUMNS.map((c) => (c.money ? (row[c.key] as number).toFixed(2) : row[c.key])))),
        csvLine('Total', '', ...BOOKING_COLUMNS.map((c) => (c.money ? report.totals[c.key].toFixed(2) : report.totals[c.key]))),
      ];
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'bookings',
        entityType: 'ticketing-report',
        entityLabel: `Ticketing report by ${GROUP_LABEL[groupBy].toLowerCase()}`,
        meta: { groupBy, from: range.from, to: range.to, rows: report.rows.length, bookings: report.totals.bookings },
        request,
      });
      return csvDownload(lines.join('\r\n'), exportFilename(`ticketing report by ${GROUP_LABEL[groupBy]}`, range.label));
    }

    return ok({
      kind: 'bookings',
      groupBy,
      groupLabel: GROUP_LABEL[groupBy],
      range: { from: range.from, to: range.to, label: range.label, preset: range.preset },
      timezone: REPORT_TIMEZONE_LABEL,
      generatedAt,
      rows: report.rows,
      totals: report.totals,
      check: report.check,
      matches,
      truncated: report.truncated,
    });
  } catch (error) {
    console.error('Ticketing report failed:', error);
    return fail('Failed to build the ticketing report', 500);
  }
}
