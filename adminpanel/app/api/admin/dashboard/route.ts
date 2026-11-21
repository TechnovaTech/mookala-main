import { NextRequest } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can, normaliseRole } from '@/lib/permissions';
import { ok, fail, toObjectId, parseAmount } from '@/lib/http';
import { SERVICES, roundMoney } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

/**
 * Everything the main dashboard shows, in one request.
 *
 *   GET /api/admin/dashboard?range=today|7d|month|year|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=auto|day|month|year
 *
 * All dates are read in India Standard Time (Asia/Kolkata, UTC+05:30).
 * Money comes only from successful entries in the `transactions` ledger; it is
 * never estimated from booking prices. The financial block is left out of the
 * response for admins without `finance:view`.
 */

const TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MAX_PERIODS = 120;

type Granularity = 'day' | 'month' | 'year';

const PERIOD_FORMAT: Record<Granularity, string> = { day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' };

/** Bookings that were actually placed (not abandoned at the payment step). */
const PLACED = { $nin: ['pending_payment', 'expired'] };
/** Bookings that hold seats. An attended booking is a confirmed booking that was checked in. */
const CONFIRMED = { $in: ['confirmed', 'attended'] };

/** The instant at which an IST calendar day starts. */
function istDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/** Calendar parts of an instant as seen in IST. */
function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const start = istDayStart(year, month, day);
  const back = istParts(start);
  // Rejects impossible dates such as 2026-02-31.
  if (back.year !== year || back.month !== month || back.day !== day) return null;
  return start;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function periodKey(date: Date, granularity: Granularity): string {
  const { year, month, day } = istParts(date);
  if (granularity === 'year') return String(year);
  if (granularity === 'month') return `${year}-${pad(month)}`;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Every period between two instants, oldest first. */
function periodsBetween(start: Date, end: Date, granularity: Granularity): string[] {
  const keys: string[] = [];
  const last = periodKey(new Date(end.getTime() - 1), granularity);
  let { year, month, day } = istParts(start);

  for (let guard = 0; guard < 5000; guard++) {
    const key = periodKey(istDayStart(year, month, day), granularity);
    keys.push(key);
    if (key === last) break;
    if (granularity === 'year') {
      year += 1;
      month = 1;
      day = 1;
    } else if (granularity === 'month') {
      month += 1;
      day = 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    } else {
      const next = istParts(new Date(istDayStart(year, month, day).getTime() + DAY_MS));
      year = next.year;
      month = next.month;
      day = next.day;
    }
  }
  return keys;
}

const toNumber = (field: string) => ({
  $convert: { input: field, to: 'double', onError: 0, onNull: 0 },
});

async function safe<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (error) {
    console.error('Dashboard query failed:', error);
    return fallback;
  }
}

interface PlaceRow {
  city: string;
  state: string;
  bookings: number;
  seats: number;
  value: number;
}

/**
 * Confirmed bookings (and, for finance readers, verified payments) grouped by
 * where the event takes place. Events store `location.city` and
 * `location.state`; there is no district field anywhere.
 */
async function placePerformance(db: Db, created: Record<string, any>, includeValue: boolean) {
  const bookingRows = await db
    .collection('bookings')
    .aggregate([
      { $match: { createdAt: created, status: CONFIRMED } },
      { $group: { _id: '$eventId', bookings: { $sum: 1 }, seats: { $sum: toNumber('$totalSeats') } } },
    ])
    .toArray();

  const valueRows = includeValue
    ? await db
        .collection('transactions')
        .aggregate([
          { $match: { type: 'payment', status: 'success', createdAt: created, eventId: { $nin: [null, ''] } } },
          { $group: { _id: '$eventId', value: { $sum: '$amount' } } },
        ])
        .toArray()
    : [];

  const eventIds = new Set<string>();
  for (const row of [...bookingRows, ...valueRows]) if (row._id) eventIds.add(String(row._id));
  if (eventIds.size === 0) return { cities: [], states: [] };

  const ids: any[] = [];
  for (const id of eventIds) {
    const oid = toObjectId(id);
    ids.push(oid || id);
  }
  const events = await db
    .collection('events')
    .find({ _id: { $in: ids } }, { projection: { 'location.city': 1, 'location.state': 1 } })
    .toArray();
  const placeOf = new Map<string, { city: string; state: string }>();
  for (const event of events) {
    placeOf.set(String(event._id), {
      city: typeof event.location?.city === 'string' ? event.location.city.trim() : '',
      state: typeof event.location?.state === 'string' ? event.location.state.trim() : '',
    });
  }

  const cities = new Map<string, PlaceRow>();
  const states = new Map<string, PlaceRow & { cityNames: Set<string> }>();
  const buckets = (eventId: string) => {
    const place = placeOf.get(eventId);
    const city = place?.city || '';
    const state = place?.state || '';
    // The same city name in two states is two different places.
    const cityKey = city.toLowerCase() + '|' + state.toLowerCase();
    let cityEntry = cities.get(cityKey);
    if (!cityEntry) {
      cityEntry = { city, state, bookings: 0, seats: 0, value: 0 };
      cities.set(cityKey, cityEntry);
    }
    const stateKey = state.toLowerCase();
    let stateEntry = states.get(stateKey);
    if (!stateEntry) {
      stateEntry = { city: '', state, bookings: 0, seats: 0, value: 0, cityNames: new Set<string>() };
      states.set(stateKey, stateEntry);
    }
    if (city) stateEntry.cityNames.add(city.toLowerCase());
    return [cityEntry, stateEntry];
  };
  for (const row of bookingRows) {
    for (const entry of buckets(String(row._id))) {
      entry.bookings += row.bookings;
      entry.seats += row.seats;
    }
  }
  for (const row of valueRows) for (const entry of buckets(String(row._id))) entry.value += row.value;

  const order = (a: PlaceRow, b: PlaceRow) => b.bookings - a.bookings || b.value - a.value;
  return {
    cities: [...cities.values()]
      .sort(order)
      .slice(0, 25)
      .map((entry) => ({ ...entry, value: includeValue ? roundMoney(entry.value) : null })),
    states: [...states.values()]
      .sort(order)
      .slice(0, 40)
      .map((entry) => ({
        state: entry.state,
        cities: entry.cityNames.size,
        bookings: entry.bookings,
        seats: entry.seats,
        value: includeValue ? roundMoney(entry.value) : null,
      })),
  };
}

/** Services the platform sells itself, with no organiser, artist or instructor to pay out. */
const DIRECT_SERVICES = new Set<string>(['membership', 'advertising', 'premium_search']);

/** Smallest group of returning-eligible customers for which a retention percentage is shown. */
const RETENTION_MIN_CUSTOMERS = 5;

/**
 * Retention for the selected period: of the customers whose first placed
 * booking was before the period started, the share who placed at least one
 * more booking inside the period. Abandoned and expired bookings do not count.
 */
async function retention(db: Db, start: Date, end: Date) {
  const rows = await db
    .collection('bookings')
    .aggregate([
      { $match: { createdAt: { $lt: end }, status: PLACED, userPhone: { $nin: [null, ''] } } },
      {
        $group: {
          _id: '$userPhone',
          first: { $min: '$createdAt' },
          inRange: { $sum: { $cond: [{ $gte: ['$createdAt', start] }, 1, 0] } },
        },
      },
      { $match: { first: { $lt: start } } },
      { $group: { _id: null, eligible: { $sum: 1 }, returned: { $sum: { $cond: [{ $gt: ['$inRange', 0] }, 1, 0] } } } },
    ])
    .toArray();
  const eligible = rows[0]?.eligible || 0;
  const returned = rows[0]?.returned || 0;
  const enough = eligible >= RETENTION_MIN_CUSTOMERS;
  return {
    eligible,
    returned,
    minimum: RETENTION_MIN_CUSTOMERS,
    rate: enough ? Math.round((returned / eligible) * 1000) / 10 : null,
  };
}

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'dashboard:view');
  if (!check.ok) return check.response;
  const { admin } = check;

  const params = request.nextUrl.searchParams;
  const range = params.get('range') || 'month';
  const now = new Date();
  const today = istParts(now);
  const tomorrowStart = new Date(istDayStart(today.year, today.month, today.day).getTime() + DAY_MS);

  let start: Date;
  let end: Date = tomorrowStart;

  if (range === 'today') {
    start = istDayStart(today.year, today.month, today.day);
  } else if (range === '7d') {
    start = new Date(istDayStart(today.year, today.month, today.day).getTime() - 6 * DAY_MS);
  } else if (range === 'month') {
    start = istDayStart(today.year, today.month, 1);
  } else if (range === 'year') {
    start = istDayStart(today.year, 1, 1);
  } else if (range === 'custom') {
    const from = parseDay(params.get('from'));
    const to = parseDay(params.get('to'));
    if (!from || !to) return fail('Choose a valid start and end date (YYYY-MM-DD).');
    if (from.getTime() > to.getTime()) return fail('The start date must not be after the end date.');
    if (to.getTime() - from.getTime() > 3660 * DAY_MS) return fail('The custom range can cover at most ten years.');
    start = from;
    end = new Date(to.getTime() + DAY_MS);
  } else {
    return fail('Unknown range. Use today, 7d, month, year or custom.');
  }

  const spanDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const requested = params.get('granularity') || 'auto';
  if (!['auto', 'day', 'month', 'year'].includes(requested)) return fail('Unknown granularity.');
  const granularity: Granularity =
    requested !== 'auto' ? (requested as Granularity) : spanDays <= 62 ? 'day' : spanDays <= 1100 ? 'month' : 'year';

  const allPeriods = periodsBetween(start, end, granularity);
  const periods = allPeriods.slice(-MAX_PERIODS);
  const periodExpr = (field: string) => ({
    $dateToString: { format: PERIOD_FORMAT[granularity], date: field, timezone: TIMEZONE },
  });

  const created = { $gte: start, $lt: end };
  const showFinance = can(admin, 'finance:view');
  const { db } = await connectToDatabase();

  /* ------------------------- platform activity ------------------------- */
  const [
    totalUsers,
    newUsers,
    activePhones,
    artistsTotal,
    artistsApproved,
    artistsPending,
    organizers,
    venues,
    bookingStatusRows,
    seatRows,
    activeMemberships,
    unverifiedBookings,
    newUserRows,
    repeatRows,
  ] = await Promise.all([
    safe(db.collection('users').countDocuments({}), 0),
    safe(db.collection('users').countDocuments({ createdAt: created }), 0),
    safe(db.collection('bookings').distinct('userPhone', { createdAt: created, userPhone: { $nin: [null, ''] } }), []),
    safe(db.collection('artists').countDocuments({}), 0),
    safe(db.collection('artists').countDocuments({ kycStatus: 'approved' }), 0),
    // Same definition as the "Artist verifications pending" alert: documents submitted, decision outstanding.
    safe(db.collection('artists').countDocuments({ kycStatus: 'pending', aadharId: { $exists: true, $ne: '' } }), 0),
    safe(db.collection('organizers').countDocuments({}), 0),
    safe(db.collection('venues').countDocuments({}), 0),
    safe(
      db
        .collection('bookings')
        .aggregate([{ $match: { createdAt: created } }, { $group: { _id: '$status', count: { $sum: 1 } } }])
        .toArray(),
      []
    ),
    safe(
      db
        .collection('bookings')
        .aggregate([
          { $match: { createdAt: created, status: CONFIRMED } },
          { $group: { _id: null, seats: { $sum: toNumber('$totalSeats') } } },
        ])
        .toArray(),
      []
    ),
    // A subscription past its expiry date is not active, even if nobody has
    // opened a membership screen since. "Today" starts at midnight in India.
    safe(
      db.collection('membershipSubscriptions').countDocuments({
        status: 'active',
        $or: [
          { expiresOn: { $gte: new Date(Math.floor((Date.now() + 19800000) / 86400000) * 86400000 - 19800000) } },
          { expiresOn: null },
        ],
      }),
      0
    ),
    safe(db.collection('bookings').countDocuments({ paymentStatus: 'unverified' }), 0),
    safe(
      db
        .collection('users')
        .aggregate([
          { $match: { createdAt: created } },
          { $group: { _id: periodExpr('$createdAt'), count: { $sum: 1 } } },
        ])
        .toArray(),
      []
    ),
    safe(
      db
        .collection('bookings')
        .aggregate([
          { $match: { createdAt: created, status: PLACED, userPhone: { $nin: [null, ''] } } },
          { $group: { _id: '$userPhone', inRange: { $sum: 1 } } },
          {
            $lookup: {
              from: 'bookings',
              let: { phone: '$_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$userPhone', '$$phone'] }, status: PLACED } },
                { $count: 'count' },
              ],
              as: 'all',
            },
          },
          {
            $group: {
              _id: null,
              bookers: { $sum: 1 },
              repeatInRange: { $sum: { $cond: [{ $gt: ['$inRange', 1] }, 1, 0] } },
              repeatOverall: {
                $sum: { $cond: [{ $gt: [{ $ifNull: [{ $arrayElemAt: ['$all.count', 0] }, 0] }, 1] }, 1, 0] },
              },
            },
          },
        ])
        .toArray(),
      []
    ),
  ]);

  const byStatus: Record<string, number> = {};
  let totalBookings = 0;
  for (const row of bookingStatusRows) {
    const key = row._id ? String(row._id) : 'unknown';
    byStatus[key] = (byStatus[key] || 0) + row.count;
    totalBookings += row.count;
  }

  const confirmed = (byStatus.confirmed || 0) + (byStatus.attended || 0);
  const started = confirmed + (byStatus.pending_payment || 0) + (byStatus.expired || 0);

  const newUsersByPeriod = new Map(newUserRows.map((row) => [String(row._id), row.count as number]));
  const repeat = repeatRows[0] || { bookers: 0, repeatInRange: 0, repeatOverall: 0 };

  /* ----------------------------- finance ------------------------------ */
  let finance: Record<string, any> | undefined;
  let trend: Record<string, any>[] | undefined;
  let revenueByService: Record<string, any>[] | undefined;

  if (showFinance) {
    const [ledgerEntries, typeRows, trendRows, settlementRows] = await Promise.all([
      safe(db.collection('transactions').estimatedDocumentCount(), 0),
      safe(
        db
          .collection('transactions')
          .aggregate([
            { $match: { status: 'success', createdAt: created } },
            { $group: { _id: { type: '$type', service: '$service' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
          ])
          .toArray(),
        []
      ),
      safe(
        db
          .collection('transactions')
          .aggregate([
            {
              $match: {
                status: 'success',
                createdAt: created,
                type: { $in: ['payment', 'commission', 'refund_deduction', 'refund'] },
              },
            },
            { $group: { _id: { period: periodExpr('$createdAt'), type: '$type' }, total: { $sum: '$amount' } } },
          ])
          .toArray(),
        []
      ),
      // What is still owed to payees right now, whatever the date filter says.
      safe(
        db
          .collection('settlements')
          .find(
            // Everything not yet paid, including a failed payout: it is still owed.
            { status: { $in: ['pending', 'awaiting_second_approval', 'approved', 'on_hold', 'failed'] } },
            { projection: { netAmount: 1 } }
          )
          .toArray(),
        []
      ),
    ]);

    const sumOf = (type: string, service?: string) =>
      roundMoney(
        typeRows
          .filter((row) => row._id.type === type && (!service || row._id.service === service))
          .reduce((sum, row) => sum + (row.total || 0), 0)
      );

    const commission = sumOf('commission');
    const refundDeductions = sumOf('refund_deduction');

    finance = {
      ledgerEmpty: ledgerEntries === 0,
      entriesInRange: typeRows.reduce((sum, row) => sum + row.count, 0),
      gtv: sumOf('payment'),
      platformRevenue: roundMoney(commission + refundDeductions),
      commissionRevenue: commission,
      refundDeductions,
      membershipRevenue: sumOf('payment', 'membership'),
      advertisementRevenue: sumOf('payment', 'advertising'),
      refunds: sumOf('refund'),
      gst: sumOf('gst'),
      gatewayFees: sumOf('gateway_fee'),
      settlementsPaid: sumOf('settlement'),
      pendingSettlements: {
        count: settlementRows.length,
        amount: roundMoney(settlementRows.reduce((sum, row) => sum + parseAmount(row.netAmount), 0)),
      },
    };

    const trendMap = new Map<string, Record<string, number>>();
    for (const row of trendRows) {
      const entry = trendMap.get(row._id.period) || {};
      entry[row._id.type] = (entry[row._id.type] || 0) + row.total;
      trendMap.set(row._id.period, entry);
    }
    trend = periods.map((period) => {
      const entry = trendMap.get(period) || {};
      return {
        period,
        gtv: roundMoney(entry.payment || 0),
        platformRevenue: roundMoney((entry.commission || 0) + (entry.refund_deduction || 0)),
        refunds: roundMoney(entry.refund || 0),
      };
    });

    const seen = new Set<string>(typeRows.map((row) => String(row._id.service || 'unknown')));
    const labels = new Map<string, string>(SERVICES.map((service) => [service.value, service.label]));
    revenueByService = [...seen]
      .map((service) => {
        const own = (type: string) =>
          roundMoney(
            typeRows
              .filter((row) => row._id.type === type && String(row._id.service || 'unknown') === service)
              .reduce((sum, row) => sum + (row.total || 0), 0)
          );
        const direct = DIRECT_SERVICES.has(service);
        return {
          service,
          label: labels.get(service) || (service === 'unknown' ? 'Service not recorded' : service),
          payments: typeRows
            .filter((row) => row._id.type === 'payment' && String(row._id.service || 'unknown') === service)
            .reduce((sum, row) => sum + row.count, 0),
          gtv: own('payment'),
          commission: own('commission'),
          refundDeductions: own('refund_deduction'),
          platformRevenue: roundMoney(own('commission') + own('refund_deduction')),
          // What the platform keeps from the service. Where the platform is the
          // seller the whole payment is its income; elsewhere it keeps the
          // commission and any refund deduction.
          basis: direct ? 'direct' : 'commission',
          earnings: direct
            ? roundMoney(own('payment') - own('refund'))
            : roundMoney(own('commission') + own('refund_deduction')),
          earningsShare:
            own('payment') > 0
              ? Math.round(
                  ((direct ? own('payment') - own('refund') : own('commission') + own('refund_deduction')) / own('payment')) * 1000
                ) / 10
              : null,
          gst: own('gst'),
          gatewayFees: own('gateway_fee'),
          refunds: own('refund'),
        };
      })
      .sort((a, b) => b.earnings - a.earnings || b.gtv - a.gtv);
  }

  /* ------------------------- performance & feed ------------------------ */
  const isSuper = normaliseRole(admin.role) === 'super_admin';
  const auditFilter = isSuper || can(admin, 'security:view') ? {} : { adminId: admin.id || '__none__' };

  const [places, retentionResult, auditRows, bookingRows, signupRows] = await Promise.all([
    safe(placePerformance(db, created, showFinance), { cities: [], states: [] }),
    safe(retention(db, start, end), { eligible: 0, returned: 0, minimum: RETENTION_MIN_CUSTOMERS, rate: null }),
    safe(
      db
        .collection('auditLogs')
        .find(auditFilter, {
          projection: { adminName: 1, adminEmail: 1, action: 1, module: 1, entityType: 1, entityLabel: 1, createdAt: 1 },
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
      []
    ),
    can(admin, 'bookings:view')
      ? safe(
          db
            .collection('bookings')
            .find({}, { projection: { eventTitle: 1, userPhone: 1, totalSeats: 1, status: 1, paymentStatus: 1, createdAt: 1 } })
            .sort({ createdAt: -1 })
            .limit(6)
            .toArray(),
          []
        )
      : Promise.resolve(null),
    can(admin, 'users:view')
      ? safe(
          db
            .collection('users')
            .find({}, { projection: { name: 1, city: 1, createdAt: 1 } })
            .sort({ createdAt: -1 })
            .limit(6)
            .toArray(),
          []
        )
      : Promise.resolve(null),
  ]);

  const notAvailable = [
    {
      item: 'District-wise performance',
      why: 'Events record a city and a state but not a district, so results are grouped by state and by city. District figures need a district field on the event, sent by the organiser app.',
    },
  ];

  return ok({
    range: {
      key: range,
      from: start.toISOString(),
      to: end.toISOString(),
      fromDay: periodKey(start, 'day'),
      toDay: periodKey(new Date(end.getTime() - 1), 'day'),
      timezone: TIMEZONE,
      granularity,
      periodsShown: periods.length,
      periodsTotal: allPeriods.length,
    },
    canSeeFinance: showFinance,
    activity: {
      totalUsers,
      newUsers,
      activeUsers: activePhones.length,
      artists: { total: artistsTotal, approved: artistsApproved, pending: artistsPending },
      organizers,
      venues,
      bookings: { total: totalBookings, byStatus },
      seatsSold: seatRows[0]?.seats || 0,
      activeMemberships,
    },
    unverifiedBookings,
    ...(finance ? { finance, trend, revenueByService } : {}),
    performance: {
      conversion: {
        confirmed,
        started,
        rate: started > 0 ? Math.round((confirmed / started) * 1000) / 10 : null,
      },
      newUsers: periods.map((period) => ({ period, count: newUsersByPeriod.get(period) || 0 })),
      newUsersTotal: newUsers,
      repeatBookers: { bookers: repeat.bookers, repeatInRange: repeat.repeatInRange, repeatOverall: repeat.repeatOverall },
      retention: retentionResult,
      cities: places.cities,
      states: places.states,
      notAvailable,
    },
    recent: {
      audit: auditRows.map((row) => ({ ...row, _id: String(row._id) })),
      auditScope: isSuper || can(admin, 'security:view') ? 'all' : 'own',
      bookings: bookingRows ? bookingRows.map((row) => ({ ...row, _id: String(row._id) })) : null,
      signups: signupRows ? signupRows.map((row) => ({ ...row, _id: String(row._id) })) : null,
    },
  });
}
