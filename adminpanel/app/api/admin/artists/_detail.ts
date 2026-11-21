import type { Db } from 'mongodb';
import { escapeRegex, parseAmount, toObjectId } from '@/lib/http';
import { EVENT_PROJECTION, artistEventsFilter, findParty, historyFor, maskId, mediaReviewOf, toEventRow } from './_shared';
import { addDays, loadCalendar, summarise, todayInIndia } from './_availability';

const SOLD = ['confirmed', 'attended'];

function wholeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? '').replace(/[^0-9\-]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function seatsOf(booking: any): number {
  const total = wholeNumber(booking?.totalSeats);
  if (total > 0) return total;
  return Array.isArray(booking?.tickets) ? booking.tickets.reduce((sum: number, t: any) => sum + wholeNumber(t?.quantity), 0) : 0;
}

/**
 * Booking history of an artist: what customers booked on each of the artist's
 * events. Sold = bookings that are confirmed or attended. Returns the totals
 * per event and the most recent bookings.
 */
async function bookingHistory(db: Db, eventIds: string[]) {
  const perEvent = new Map<string, { bookings: number; tickets: number; value: number; checkedIn: number; cancelled: number; other: number }>();
  if (eventIds.length === 0) return { perEvent, recent: [] as any[], total: 0 };

  const idValues: any[] = [...eventIds, ...eventIds.map((id) => toObjectId(id)).filter(Boolean)];
  const filter = { eventId: { $in: idValues } };
  const projection = {
    eventId: 1,
    eventTitle: 1,
    userPhone: 1,
    status: 1,
    paymentStatus: 1,
    totalSeats: 1,
    totalPrice: 1,
    amountPaid: 1,
    'tickets.quantity': 1,
    'tickets.category': 1,
    checkedIn: 1,
    createdAt: 1,
  };
  const rows = await db.collection('bookings').find(filter, { projection }).sort({ createdAt: -1 }).limit(5000).toArray();

  for (const row of rows) {
    const key = String(row.eventId);
    const entry = perEvent.get(key) || { bookings: 0, tickets: 0, value: 0, checkedIn: 0, cancelled: 0, other: 0 };
    const seats = seatsOf(row);
    if (SOLD.includes(row.status)) {
      entry.bookings += 1;
      entry.tickets += seats;
      entry.value += parseAmount(row.totalPrice);
    } else if (row.status === 'cancelled') entry.cancelled += 1;
    else entry.other += 1;
    if (row.checkedIn === true) entry.checkedIn += seats;
    perEvent.set(key, entry);
  }

  return {
    perEvent,
    total: rows.length,
    recent: rows.slice(0, 25).map((row) => ({
      _id: String(row._id),
      eventId: String(row.eventId),
      eventTitle: row.eventTitle || '',
      userPhone: row.userPhone || '',
      status: row.status || '',
      paymentStatus: row.paymentStatus || '',
      seats: seatsOf(row),
      categories: Array.isArray(row.tickets)
        ? Array.from(new Set(row.tickets.map((t: any) => String(t?.category || '')).filter(Boolean))).join(', ')
        : '',
      totalPrice: parseAmount(row.totalPrice),
      checkedIn: row.checkedIn === true,
      createdAt: row.createdAt || null,
    })),
  };
}

/**
 * Ratings, complaints and reports about one artist, matched the same way as
 * the Artist Performance screen (see app/api/admin/artists/performance/route.ts).
 */
async function reputation(db: Db, artist: { _id: string; name: string; phone: string }, eventIds: string[]) {
  const name = artist.name.trim();
  const sameName = name
    ? await db.collection('artists').countDocuments({ name: { $regex: '^\\s*' + escapeRegex(name) + '\\s*$', $options: 'i' } })
    : 0;
  const ratingFilter: any = {
    targetType: 'artist',
    status: { $ne: 'hidden' },
    $or: [{ targetId: artist._id }, ...(toObjectId(artist._id) ? [{ targetId: toObjectId(artist._id) }] : [])],
  };
  // A rating without an id counts only when exactly one artist has that name.
  if (name && sameName === 1) {
    ratingFilter.$or.push({
      targetId: { $in: ['', null] },
      targetName: { $regex: '^\\s*' + escapeRegex(name) + '\\s*$', $options: 'i' },
    });
  }

  const idValues: any[] = [...eventIds, ...eventIds.map((id) => toObjectId(id)).filter(Boolean)];
  const eventBookingIds = eventIds.length
    ? (await db.collection('bookings').find({ eventId: { $in: idValues } }, { projection: { _id: 1 } }).limit(20000).toArray()).map((b) => String(b._id))
    : [];

  const [ratings, complaints, reports] = await Promise.all([
    db.collection('feedback').find(ratingFilter).sort({ createdAt: -1 }).limit(200).toArray(),
    db
      .collection('supportCases')
      .find({
        kind: 'complaint',
        $or: [{ artistId: artist._id }, ...(eventBookingIds.length ? [{ bookingId: { $in: eventBookingIds } }] : [])],
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    artist.phone
      ? db.collection('userReports').find({ reportedType: 'artist', reportedPhone: artist.phone }).sort({ createdAt: -1 }).limit(100).toArray()
      : Promise.resolve([] as any[]),
  ]);

  const valid = ratings.filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5);
  return {
    rating: valid.length ? Math.round((valid.reduce((sum, r) => sum + Number(r.rating), 0) / valid.length) * 100) / 100 : null,
    ratingCount: valid.length,
    ratings: valid.slice(0, 10).map((r) => ({
      _id: String(r._id),
      rating: Number(r.rating),
      comment: r.comment || '',
      customerName: r.customerName || '',
      status: r.status || '',
      createdAt: r.createdAt || null,
    })),
    complaints: complaints.map((c) => ({
      _id: String(c._id),
      subject: c.subject || '',
      status: c.status || '',
      priority: c.priority || '',
      bookingId: c.bookingId || '',
      createdAt: c.createdAt || null,
    })),
    reports: reports.map((r) => ({
      _id: String(r._id),
      reason: r.reason || '',
      details: r.details || '',
      status: r.status || '',
      createdAt: r.createdAt || null,
    })),
  };
}

/**
 * Everything the artist detail screen shows. Images are returned as links to
 * /api/images, never as data, and identity numbers are masked.
 */
export async function loadArtistDetail(db: Db, id: string, withIdentity: boolean) {
  const oid = toObjectId(id);
  if (!oid) return null;
  const row = await findParty(db, 'artist', id);
  if (!row) return null;

  const [extra] = await db
    .collection('artists')
    .aggregate([
      { $match: { _id: oid } },
      {
        $project: {
          bio: 1,
          aadharId: 1,
          panId: 1,
          hasBannerImage: { $ne: [{ $ifNull: ['$bannerImage', ''] }, ''] },
          media: {
            $map: {
              input: { $cond: [{ $isArray: '$media' }, '$media', []] },
              as: 'm',
              in: {
                type: '$$m.type',
                uploadedAt: '$$m.uploadedAt',
                reviewStatus: '$$m.reviewStatus',
                reviewedBy: '$$m.reviewedBy',
                reviewedAt: '$$m.reviewedAt',
                reviewReason: '$$m.reviewReason',
              },
            },
          },
        },
      },
    ])
    .toArray();

  const version = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  const category =
    row.categoryId && toObjectId(row.categoryId)
      ? await db
          .collection('artistCategories')
          .findOne({ _id: toObjectId(row.categoryId)! }, { projection: { name: 1, status: 1 } })
      : null;

  const [events, history] = await Promise.all([
    db
      .collection('events')
      .find(artistEventsFilter(id), { projection: EVENT_PROJECTION })
      .sort({ startDate: -1, createdAt: -1 })
      .limit(200)
      .toArray(),
    historyFor(db, 'artist', id),
  ]);

  const eventIds = events.map((event) => String(event._id));
  const today = todayInIndia();
  const [bookings, feedback, calendar] = await Promise.all([
    bookingHistory(db, eventIds),
    reputation(db, { _id: id, name: row.name, phone: row.phone }, eventIds),
    loadCalendar(db, oid, today, addDays(today, 29)),
  ]);
  const emptyStats = { bookings: 0, tickets: 0, value: 0, checkedIn: 0, cancelled: 0, other: 0 };

  return {
    ...row,
    bio: extra?.bio || '',
    categoryName: category?.name || null,
    profileImageUrl: row.hasProfileImage ? `/api/images/${id}?type=profile&v=${version}` : null,
    bannerImageUrl: extra?.hasBannerImage ? `/api/images/${id}?type=banner&v=${version}` : null,
    identity: withIdentity ? { aadhar: maskId(extra?.aadharId), pan: maskId(extra?.panId) } : null,
    media: (extra?.media || []).map((item: any, index: number) => ({
      index,
      type: item?.type || 'image',
      uploadedAt: item?.uploadedAt || null,
      reviewStatus: mediaReviewOf(item),
      reviewed: item?.reviewStatus === 'approved' || item?.reviewStatus === 'rejected',
      reviewedBy: item?.reviewedBy || null,
      reviewedAt: item?.reviewedAt || null,
      reviewReason: item?.reviewReason || '',
      url: `/api/images/${id}?type=media&index=${index}&v=${version}`,
    })),
    events: events.map((event) => ({ ...toEventRow(event, id), ...(bookings.perEvent.get(String(event._id)) || emptyStats) })),
    bookingTotals: Array.from(bookings.perEvent.values()).reduce(
      (sum, entry) => ({
        bookings: sum.bookings + entry.bookings,
        tickets: sum.tickets + entry.tickets,
        value: sum.value + entry.value,
        checkedIn: sum.checkedIn + entry.checkedIn,
        cancelled: sum.cancelled + entry.cancelled,
        other: sum.other + entry.other,
      }),
      { ...emptyStats }
    ),
    bookingCount: bookings.total,
    recentBookings: bookings.recent,
    feedback,
    availability: {
      from: today,
      to: addDays(today, 29),
      summary: summarise(calendar),
      days: calendar
        .filter((day) => day.status !== 'not_set')
        .map((day) => ({ date: day.date, status: day.status, source: day.source, note: day.note, events: day.events })),
    },
    history,
  };
}

