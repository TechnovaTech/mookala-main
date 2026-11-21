import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can, type AdminIdentity } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { csvResponse, escapeRegex, fail, ok, toCsv, toObjectId } from '@/lib/http';
import { seatsOf, summariseTickets } from '@/app/api/admin/catalogue/_lib/shared';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'rejected'];
const EXPORT_LIMIT = 5000;

/** Everything the list needs, without the base64 media stored on each event. */
const LIST_PROJECTION = {
  name: 1,
  category: 1,
  status: 1,
  organizerId: 1,
  creatorRole: 1,
  startDate: 1,
  startTime: 1,
  endDate: 1,
  locationType: 1,
  'location.name': 1,
  'location.city': 1,
  venue: 1,
  tickets: 1,
  artists: 1,
  artistResponse: 1,
  rejectionReason: 1,
  reviewedBy: 1,
  reviewedAt: 1,
  createdAt: 1,
};

function isDay(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

async function buildFilter(db: Db, params: URLSearchParams) {
  const and: Record<string, any>[] = [];

  const q = (params.get('q') || '').trim().slice(0, 100);
  if (q) {
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    const [organizers, artists] = await Promise.all([
      db.collection('organizers').find({ name: regex }, { projection: { _id: 1 } }).limit(300).toArray(),
      db.collection('artists').find({ name: regex }, { projection: { _id: 1 } }).limit(300).toArray(),
    ]);
    const creatorIds = [...organizers, ...artists].map((d) => d._id);
    and.push({
      $or: [
        { name: regex },
        { 'location.city': regex },
        { 'location.name': regex },
        ...(creatorIds.length ? [{ organizerId: { $in: creatorIds } }] : []),
      ],
    });
  }

  const category = (params.get('category') || '').trim().slice(0, 100);
  if (category) and.push({ category });

  // Event dates are stored as text in YYYY-MM-DD form, which sorts correctly as text.
  const from = params.get('from');
  const to = params.get('to');
  if (isDay(from)) and.push({ startDate: { $gte: from } });
  if (isDay(to)) and.push({ startDate: { $lte: to + '￿' } });

  return and;
}

function statusClause(status: string): Record<string, any> | null {
  if (status === 'pending') return { $or: [{ status: 'pending' }, { status: { $nin: STATUSES } }] };
  if (STATUSES.includes(status)) return { status };
  return null;
}

/**
 * Adds the creator (organiser or artist) to each event. Their phone number and
 * email are personal contact details: they are kept only for an admin who may
 * view that creator's module (Organisers or Artists).
 */
async function attachCreators(db: Db, events: any[], admin: AdminIdentity) {
  const ids = Array.from(new Set(events.map((e) => String(e.organizerId || '')).filter(Boolean)))
    .map((id) => toObjectId(id))
    .filter(Boolean) as any[];
  if (ids.length === 0) return;

  const projection = { name: 1, phone: 1, email: 1, city: 1, kycStatus: 1 };
  const [organizers, artists] = await Promise.all([
    db.collection('organizers').find({ _id: { $in: ids } }, { projection }).toArray(),
    db.collection('artists').find({ _id: { $in: ids } }, { projection }).toArray(),
  ]);
  const organizerById = new Map(organizers.map((d) => [String(d._id), d]));
  const artistById = new Map(artists.map((d) => [String(d._id), d]));

  for (const event of events) {
    const key = String(event.organizerId || '');
    const preferArtist = event.creatorRole === 'artist';
    const found = preferArtist ? artistById.get(key) || organizerById.get(key) : organizerById.get(key) || artistById.get(key);
    if (!found) {
      event.creator = null;
      continue;
    }
    const role = artistById.get(key) === found ? 'artist' : 'organizer';
    const contact = can(admin, role === 'artist' ? 'artists:view' : 'organizers:view');
    event.creator = {
      _id: String(found._id),
      role,
      name: found.name || '',
      phone: contact ? found.phone || '' : '',
      email: contact ? found.email || '' : '',
      contactHidden: !contact,
      city: found.city || '',
      kycStatus: found.kycStatus || null,
    };
  }
}

function shape(event: any) {
  const tickets = summariseTickets(event.tickets);
  return {
    _id: String(event._id),
    name: event.name || '',
    category: event.category || '',
    status: STATUSES.includes(event.status) ? event.status : 'pending',
    storedStatus: event.status ?? null,
    creator: event.creator || null,
    creatorRole: event.creator?.role || event.creatorRole || null,
    startDate: event.startDate || '',
    startTime: event.startTime || '',
    locationType: event.locationType || '',
    venueName: event.location?.name || '',
    city: event.location?.city || '',
    ticketCategories: tickets.length,
    capacity: tickets.reduce((sum, t) => sum + t.quantity, 0),
    sold: tickets.reduce((sum, t) => sum + t.sold, 0),
    hasArtists: Array.isArray(event.artists) && event.artists.length > 0,
    artistResponse: event.artistResponse || null,
    rejectionReason: event.rejectionReason || '',
    reviewedBy: event.reviewedBy || '',
    reviewedAt: event.reviewedAt || null,
    createdAt: event.createdAt || null,
  };
}

/**
 * GET /api/admin/events
 *   ?status=pending|approved|rejected  &q=  &category=  &from=YYYY-MM-DD  &to=YYYY-MM-DD
 *   &page=  &limit=  &export=csv
 * Returns one page of events, counts for each status tab and platform totals.
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'events:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;
    const collection = db.collection('events');

    const and = await buildFilter(db, params);
    const status = params.get('status') || '';
    const clause = statusClause(status);
    const filter = [...and, ...(clause ? [clause] : [])];
    const query = filter.length ? { $and: filter } : {};
    const baseQuery = and.length ? { $and: and } : {};

    if (params.get('export') === 'csv') {
      const rows = await collection.find(query, { projection: LIST_PROJECTION }).sort({ createdAt: -1 }).limit(EXPORT_LIMIT).toArray();
      await attachCreators(db, rows, check.admin);
      const flat = rows.map(shape).map((row) => ({
        ...row,
        creatorName: row.creator?.name || '',
        creatorPhone: row.creator?.phone || '',
      }));

      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'events',
        entityType: 'event',
        meta: { rows: flat.length, status: status || 'all', filters: and.length },
        request,
      });

      return csvResponse(
        toCsv(flat, [
          { key: 'name', label: 'Event' },
          { key: 'category', label: 'Category' },
          { key: 'status', label: 'Status' },
          { key: 'creatorName', label: 'Created by' },
          { key: 'creatorRole', label: 'Creator type' },
          { key: 'creatorPhone', label: 'Creator phone' },
          { key: 'startDate', label: 'Event date' },
          { key: 'startTime', label: 'Start time' },
          { key: 'venueName', label: 'Venue' },
          { key: 'city', label: 'City' },
          { key: 'capacity', label: 'Tickets on sale' },
          { key: 'sold', label: 'Tickets sold' },
          { key: 'rejectionReason', label: 'Rejection reason' },
          { key: 'reviewedBy', label: 'Reviewed by' },
          { key: 'reviewedAt', label: 'Reviewed at' },
          { key: 'createdAt', label: 'Submitted' },
        ]),
        `events-${new Date().toISOString().slice(0, 10)}.csv`
      );
    }

    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20', 10) || 20));

    const [items, total, grouped, categories, ticketRows, checkedIn] = await Promise.all([
      collection.find(query, { projection: LIST_PROJECTION }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(query),
      collection.aggregate([{ $match: baseQuery }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      collection.distinct('category'),
      // Ticket numbers are stored as text, so they are added up here rather than in the database.
      collection.find({}, { projection: { status: 1, 'tickets.quantity': 1, 'tickets.sold': 1 } }).toArray(),
      db.collection('bookings').find({ checkedIn: true }, { projection: { totalSeats: 1, 'tickets.quantity': 1 } }).toArray(),
    ]);

    await attachCreators(db, items, check.admin);

    const statusCounts: Record<string, number> = { pending: 0, approved: 0, rejected: 0, all: 0 };
    for (const row of grouped) {
      const key = STATUSES.includes(row._id) ? row._id : 'pending';
      statusCounts[key] += row.count;
      statusCounts.all += row.count;
    }

    const stats = { total: 0, pending: 0, approved: 0, rejected: 0, ticketsOnSale: 0, ticketsSold: 0, seatsCheckedIn: 0 };
    for (const row of ticketRows) {
      const key = (STATUSES.includes(row.status) ? row.status : 'pending') as 'pending' | 'approved' | 'rejected';
      stats.total += 1;
      stats[key] += 1;
      for (const ticket of summariseTickets(row.tickets)) {
        stats.ticketsOnSale += ticket.quantity;
        stats.ticketsSold += ticket.sold;
      }
    }
    stats.seatsCheckedIn = checkedIn.reduce((sum, booking) => sum + seatsOf(booking), 0);

    return ok({
      items: items.map(shape),
      total,
      page,
      limit,
      statusCounts,
      stats,
      categories: categories.filter((c) => typeof c === 'string' && c).sort(),
      canManage: can(check.admin, 'events:manage'),
    });
  } catch (error) {
    console.error('Admin event list failed:', error);
    return fail('Failed to load events', 500);
  }
}
