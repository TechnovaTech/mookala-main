import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { csvResponse, escapeRegex, fail, ok, toCsv, toObjectId } from '@/lib/http';
import { followersOf, kycViewOf, parsePaging } from '../_shared';
import { accountStatusOf } from '@/lib/user-status';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/artists/performance
 * One row per artist, computed only from stored records:
 *   events      events that list the artist in `artists`, or that the artist
 *               created (`organizerId`), excluding events the admin rejected
 *   bookings,   bookings on those events that are not cancelled, expired or
 *   tickets     still waiting for payment; tickets = their `totalSeats`
 *   checkIns    bookings on those events with `checkedIn: true`
 *   rating      published `feedback`: targetType 'artist' matched by
 *               `targetId` (or by `targetName` when it has no id and exactly
 *               one artist has that name), or a rating of an event whose
 *               `artistIds` include the artist
 *   complaints  complaints (`supportCases`, kind 'complaint') that name the
 *               artist (`artistId`) or a booking on one of the artist's events
 *   reports     `userReports` with reportedType 'artist' matched by phone
 */
const SORT_KEYS = ['name', 'events', 'followers', 'bookings', 'tickets', 'checkIns', 'rating', 'ratings', 'complaints', 'reports'];

const NOT_COUNTED = ['cancelled', 'expired', 'pending_payment'];

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'artists:view');
  if (!check.ok) return check.response;

  try {
    const { db } = await connectToDatabase();
    const params = request.nextUrl.searchParams;

    const match: Record<string, any> = {};
    const q = (params.get('q') || '').trim().slice(0, 100);
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' };
      match.$or = [{ name: regex }, { phone: regex }, { city: regex }, { genre: regex }];
    }

    const artists = await db
      .collection('artists')
      .aggregate([
        { $match: match },
        {
          $project: {
            name: 1,
            phone: 1,
            city: 1,
            genre: 1,
            kycStatus: 1,
            accountStatus: 1,
            isActive: 1,
            followersCount: 1,
            kycSubmitted: { $ne: [{ $ifNull: ['$aadharId', ''] }, ''] },
            followersListed: { $cond: [{ $isArray: '$followers' }, { $size: '$followers' }, 0] },
          },
        },
      ])
      .toArray();

    const artistIds = new Set(artists.map((a) => String(a._id)));

    // Events per artist.
    const events = await db
      .collection('events')
      .find({ status: { $ne: 'rejected' } }, { projection: { artists: 1, organizerId: 1 } })
      .toArray();
    const eventsOf = new Map<string, Set<string>>();
    const artistsOfEvent = new Map<string, string[]>();
    for (const event of events) {
      const eventId = String(event._id);
      const linked = new Set<string>();
      if (Array.isArray(event.artists)) for (const a of event.artists) linked.add(String(a));
      if (event.organizerId) linked.add(String(event.organizerId));
      const mine = Array.from(linked).filter((id) => artistIds.has(id));
      if (mine.length === 0) continue;
      artistsOfEvent.set(eventId, mine);
      for (const id of mine) {
        if (!eventsOf.has(id)) eventsOf.set(id, new Set());
        eventsOf.get(id)!.add(eventId);
      }
    }

    // Bookings per event. `eventId` is a string on bookings; old rows may hold an ObjectId.
    const eventIds = Array.from(artistsOfEvent.keys());
    const eventIdValues: any[] = [...eventIds, ...eventIds.map((id) => toObjectId(id)).filter(Boolean)];
    const counted = { $not: [{ $in: ['$status', NOT_COUNTED] }] };
    const bookingRows = eventIds.length
      ? await db
          .collection('bookings')
          .aggregate([
            { $match: { eventId: { $in: eventIdValues } } },
            {
              $group: {
                _id: { $toString: '$eventId' },
                bookings: { $sum: { $cond: [counted, 1, 0] } },
                tickets: {
                  $sum: {
                    $cond: [counted, { $convert: { input: '$totalSeats', to: 'int', onError: 0, onNull: 0 } }, 0],
                  },
                },
                checkIns: { $sum: { $cond: [{ $eq: ['$checkedIn', true] }, 1, 0] } },
              },
            },
          ])
          .toArray()
      : [];
    const bookingsOfEvent = new Map(bookingRows.map((row) => [String(row._id), row]));

    // Ratings.
    const byName = new Map<string, string[]>();
    for (const artist of artists) {
      const key = String(artist.name || '').trim().toLowerCase();
      if (!key) continue;
      byName.set(key, [...(byName.get(key) || []), String(artist._id)]);
    }
    const ratingOf = new Map<string, { sum: number; count: number }>();
    // Published ratings only: of the artist, or of an event the artist performed in or created.
    const feedback = await db
      .collection('feedback')
      .find(
        { status: 'published', $or: [{ targetType: 'artist' }, { targetType: 'event', 'artistIds.0': { $exists: true } }] },
        { projection: { targetType: 1, targetId: 1, targetName: 1, artistIds: 1, rating: 1 } }
      )
      .toArray();
    for (const entry of feedback) {
      const rating = Number(entry.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
      const ids = new Set<string>();
      if (entry.targetType === 'event') {
        for (const artistId of Array.isArray(entry.artistIds) ? entry.artistIds : []) if (artistIds.has(String(artistId))) ids.add(String(artistId));
      } else if (entry.targetId && artistIds.has(String(entry.targetId))) {
        ids.add(String(entry.targetId));
      } else if (!entry.targetId) {
        const candidates = byName.get(String(entry.targetName || '').trim().toLowerCase()) || [];
        if (candidates.length === 1) ids.add(candidates[0]);
      }
      for (const id of ids) {
        const current = ratingOf.get(id) || { sum: 0, count: 0 };
        ratingOf.set(id, { sum: current.sum + rating, count: current.count + 1 });
      }
    }

    // Complaints.
    const complaintsOf = new Map<string, number>();
    const complaints = await db
      .collection('supportCases')
      .find({ kind: 'complaint' }, { projection: { artistId: 1, bookingId: 1 } })
      .toArray();
    const bookingRefs = Array.from(
      new Set(complaints.map((c) => (typeof c.bookingId === 'string' ? c.bookingId.trim() : '')).filter(Boolean))
    );
    const bookingEvent = new Map<string, string>();
    if (bookingRefs.length) {
      const ids: any[] = [...bookingRefs, ...bookingRefs.map((id) => toObjectId(id)).filter(Boolean)];
      const found = await db
        .collection('bookings')
        .find({ _id: { $in: ids } }, { projection: { eventId: 1 } })
        .toArray();
      for (const booking of found) bookingEvent.set(String(booking._id), String(booking.eventId || ''));
    }
    for (const complaint of complaints) {
      const targets = new Set<string>();
      if (complaint.artistId && artistIds.has(String(complaint.artistId))) targets.add(String(complaint.artistId));
      const eventId = typeof complaint.bookingId === 'string' ? bookingEvent.get(complaint.bookingId.trim()) : undefined;
      if (eventId) for (const id of artistsOfEvent.get(eventId) || []) targets.add(id);
      for (const id of targets) complaintsOf.set(id, (complaintsOf.get(id) || 0) + 1);
    }

    // Reports.
    const reportsByPhone = new Map<string, number>();
    const reports = await db
      .collection('userReports')
      .find({ reportedType: 'artist' }, { projection: { reportedPhone: 1 } })
      .toArray();
    for (const report of reports) {
      const phone = String(report.reportedPhone || '').trim();
      if (phone) reportsByPhone.set(phone, (reportsByPhone.get(phone) || 0) + 1);
    }

    const rows = artists.map((artist) => {
      const id = String(artist._id);
      let bookings = 0;
      let tickets = 0;
      let checkIns = 0;
      for (const eventId of eventsOf.get(id) || []) {
        const row = bookingsOfEvent.get(eventId);
        if (!row) continue;
        bookings += row.bookings;
        tickets += row.tickets;
        checkIns += row.checkIns;
      }
      const rating = ratingOf.get(id);
      return {
        _id: id,
        name: artist.name || '',
        phone: artist.phone || '',
        city: artist.city || '',
        genre: artist.genre || '',
        kyc: kycViewOf(artist),
        accountStatus: accountStatusOf(artist),
        events: eventsOf.get(id)?.size || 0,
        followers: followersOf(artist),
        bookings,
        tickets,
        checkIns,
        rating: rating ? Math.round((rating.sum / rating.count) * 100) / 100 : null,
        ratings: rating?.count || 0,
        complaints: complaintsOf.get(id) || 0,
        reports: reportsByPhone.get(String(artist.phone || '').trim()) || 0,
      };
    });

    const sortKey = SORT_KEYS.includes(params.get('sort') || '') ? (params.get('sort') as string) : 'events';
    const dir = params.get('dir') === 'asc' ? 1 : -1;
    rows.sort((a: any, b: any) => {
      const left = a[sortKey];
      const right = b[sortKey];
      // Artists with no rating always sort last.
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      const order = typeof left === 'string' ? left.localeCompare(String(right)) : (left as number) - (right as number);
      return order !== 0 ? order * dir : a.name.localeCompare(b.name);
    });

    if (params.get('export') === 'csv') {
      await logAudit({
        admin: check.admin,
        action: 'export',
        module: 'artists',
        entityType: 'artist-performance',
        meta: { rows: rows.length },
        request,
      });
      return csvResponse(
        toCsv(rows, [
          { key: 'name', label: 'Artist' },
          { key: 'phone', label: 'Phone' },
          { key: 'city', label: 'City' },
          { key: 'genre', label: 'Genre' },
          { key: 'events', label: 'Events' },
          { key: 'followers', label: 'Followers' },
          { key: 'bookings', label: 'Bookings' },
          { key: 'tickets', label: 'Tickets sold' },
          { key: 'checkIns', label: 'Check-ins' },
          { key: 'rating', label: 'Average rating' },
          { key: 'ratings', label: 'Ratings' },
          { key: 'complaints', label: 'Complaints' },
          { key: 'reports', label: 'Reports' },
        ]),
        `artist-performance-${new Date().toISOString().slice(0, 10)}.csv`
      );
    }

    const { page, limit } = parsePaging(params);
    return ok({
      items: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      page,
      limit,
      totals: {
        artists: rows.length,
        events: eventIds.length,
        // Summed per event, so a booking on an event with two artists is counted once.
        bookings: bookingRows.reduce((sum, row) => sum + (row.bookings || 0), 0),
        ratings: rows.reduce((sum, row) => sum + row.ratings, 0),
      },
    });
  } catch (error) {
    console.error('Artist performance failed:', error);
    return fail('Failed to load artist performance', 500);
  }
}
