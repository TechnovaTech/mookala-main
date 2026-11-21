import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { asString, fail, ok, toObjectId } from '@/lib/http';
import { buildListFilter, findParty, listParties, parsePaging } from '../_shared';
import {
  AVAILABILITY_STATUSES,
  addDays,
  applyChanges,
  daysBetween,
  eventBookedDays,
  loadCalendar,
  parseDay,
  readChanges,
  summarise,
  todayInIndia,
} from '../_availability';

export const dynamic = 'force-dynamic';

/** First and last day of a month given as YYYY-MM. */
function monthRange(value: string | null): { month: string; from: string; to: string } | null {
  const month = value && /^\d{4}-\d{2}$/.test(value) ? value : todayInIndia().slice(0, 7);
  const from = parseDay(month + '-01');
  if (!from) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { month, from, to: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * GET /api/admin/artists/availability?month=YYYY-MM
 *   &artistId=<id>   one artist's calendar for the month, with who set each day
 *   (no artistId)    artists (search q, city, kyc, account, paging) with the
 *                    number of available, unavailable and booked days in the month
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'artists:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;
  if (params.get('month') && !/^\d{4}-\d{2}$/.test(params.get('month') || '')) return fail('month must be in YYYY-MM format', 400);
  const range = monthRange(params.get('month'));
  if (!range) return fail('month must be in YYYY-MM format', 400);

  try {
    const { db } = await connectToDatabase();
    const canManage = can(check.admin, 'artists:manage');
    const artistParam = params.get('artistId');

    if (artistParam) {
      const oid = toObjectId(artistParam);
      if (!oid) return fail('Invalid artist id', 400);
      const artist = await findParty(db, 'artist', artistParam);
      if (!artist) return fail('Artist not found', 404);

      const [days, overrides] = await Promise.all([
        loadCalendar(db, oid, range.from, range.to),
        db
          .collection('auditLogs')
          .find({ entityType: 'artist', entityId: artistParam, action: 'availability_override' })
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray(),
      ]);

      return ok({
        ...range,
        today: todayInIndia(),
        artist: {
          _id: artist._id,
          name: artist.name,
          phone: artist.phone,
          city: artist.city,
          genre: artist.genre,
          kyc: artist.kyc,
          accountStatus: artist.accountStatus,
        },
        days,
        summary: summarise(days),
        overrides: overrides.map((row) => ({
          _id: String(row._id),
          adminName: row.adminName || row.adminEmail || 'Admin',
          before: row.before || {},
          after: row.after || {},
          reason: row.reason || '',
          createdAt: row.createdAt,
        })),
        canManage,
      });
    }

    const paging = parsePaging(params, 50);
    const { rows, total } = await listParties(db, 'artist', buildListFilter(params, 'artist'), {
      ...paging,
      sort: { name: 1, _id: -1 },
    });

    const ids = rows.map((row) => row._id);
    const stored = ids.length
      ? await db
          .collection('artistAvailability')
          .find({ artistId: { $in: ids }, date: { $gte: range.from, $lte: range.to } }, { projection: { artistId: 1, date: 1, status: 1 } })
          .toArray()
      : [];
    const storedOf = new Map<string, Map<string, string>>();
    for (const row of stored) {
      if (!storedOf.has(row.artistId)) storedOf.set(row.artistId, new Map());
      storedOf.get(row.artistId)!.set(row.date, row.status);
    }
    const monthDays = daysBetween(range.from, range.to);

    const items = await Promise.all(
      rows.map(async (row) => {
        const booked = await eventBookedDays(db, toObjectId(row._id)!, range.from, range.to);
        const mine = storedOf.get(row._id) || new Map<string, string>();
        const counts = { available: 0, unavailable: 0, booked: 0, not_set: 0 };
        for (const day of monthDays) {
          const status = booked.has(day) ? 'booked' : mine.get(day);
          if (status === 'available' || status === 'unavailable' || status === 'booked') counts[status] += 1;
          else counts.not_set += 1;
        }
        return {
          _id: row._id,
          name: row.name,
          phone: row.phone,
          city: row.city,
          genre: row.genre,
          kyc: row.kyc,
          accountStatus: row.accountStatus,
          ...counts,
        };
      })
    );

    return ok({ ...range, today: todayInIndia(), items, total, page: paging.page, limit: paging.limit, canManage });
  } catch (error) {
    console.error('Artist availability (admin) failed:', error);
    return fail('Failed to load availability', 500);
  }
}

/**
 * POST /api/admin/artists/availability
 *   { artistId, from: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', status, note?, reason }
 * status: 'available' | 'unavailable' | 'booked', or 'clear' to remove what is
 * recorded. An admin override always needs a reason and is written to the
 * activity log with the old and new status of every day it changed. Days with
 * an accepted event are refused: nothing is saved.
 */
export async function POST(request: NextRequest) {
  const check = await requireAdmin(request, 'artists:manage');
  if (!check.ok) return check.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body', 400);
  }
  if (!body || typeof body !== 'object') return fail('Invalid request body', 400);

  const artistId = asString(body.artistId, 40);
  const oid = toObjectId(artistId);
  if (!oid) return fail('Invalid artist id', 400);

  const from = parseDay(body.from);
  const to = body.to === undefined || body.to === null || body.to === '' ? from : parseDay(body.to);
  if (!from || !to) return fail('Dates must be in YYYY-MM-DD format', 400);
  if (to < from) return fail('The end date is before the start date', 400);
  if (to > addDays(from, 61)) return fail('An override can cover at most 62 days', 400);

  const reason = asString(body.reason, 1000);
  if (!reason) return fail('A reason is required to change an artist\'s availability.', 400);

  const parsed = readChanges(
    { dates: daysBetween(from, to), status: body.status, note: body.note },
    [...AVAILABILITY_STATUSES, 'clear']
  );
  if ('error' in parsed) return fail(parsed.error, 400);

  try {
    const { db } = await connectToDatabase();
    const artist = await findParty(db, 'artist', artistId);
    if (!artist) return fail('Artist not found', 404);

    const result = await applyChanges({
      db,
      artistId: oid,
      changes: parsed.changes,
      by: check.admin.email || check.admin.name || 'admin',
      role: 'admin',
      reason,
    });
    if (result.refused.length) {
      const first = result.refused[0];
      return fail(
        `${artist.name || 'The artist'} has an accepted event on ${result.refused.map((entry) => entry.date).join(', ')} (${first.events
          .map((event) => event.name)
          .join(', ')}), so ${result.refused.length === 1 ? 'that day stays' : 'those days stay'} booked. Nothing was saved.`,
        409,
        { bookedDates: result.refused.map((entry) => entry.date) }
      );
    }

    const changed = Object.keys(result.after).length;
    if (changed === 0) return fail('Those days already have that status, so nothing was changed.', 409);

    await logAudit({
      admin: check.admin,
      action: 'availability_override',
      module: 'artists',
      entityType: 'artist',
      entityId: artistId,
      entityLabel: artist.name || artist.phone,
      before: result.before,
      after: result.after,
      reason,
      meta: { from, to, status: body.status, days: changed, note: parsed.changes[0]?.note || '' },
      request,
    });

    return ok({ changed, from, to });
  } catch (error) {
    console.error('Artist availability override failed:', error);
    return fail('Failed to save the override', 500);
  }
}
