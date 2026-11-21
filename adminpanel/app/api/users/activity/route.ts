import { NextRequest, NextResponse } from 'next/server';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { ok, fail, toObjectId, asString, escapeRegex, parseAmount } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/**
 * GET /api/users/activity
 * One feed of what customers did and what was done to their accounts, newest
 * first, across all users (requirements section 3, "User Activity").
 *
 *   type   one or more of the keys of SOURCES, comma separated (default: all)
 *   from   YYYY-MM-DD, India Standard Time, inclusive
 *   to     YYYY-MM-DD, India Standard Time, inclusive
 *   user   a user id, or text matched against name, phone and email
 *   page, limit   paging (limit 1 to 100, default 25)
 *
 * Every row comes from a stored record: `users`, `otpEvents`, `bookings`,
 * `supportCases`, `feedback`, `userReports` and `auditLogs`. Nothing is
 * inferred. Sign-ins exist only from the time the OTP service started
 * recording them.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
/** The feed is merged from several collections, so paging stops at this many rows. */
const MAX_DEPTH = 5000;
const USER_MATCH_LIMIT = 500;

function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
  const back = new Date(start.getTime() + IST_OFFSET_MS);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() + 1 !== month || back.getUTCDate() !== day) return null;
  return start;
}

interface Row {
  id: string;
  type: string;
  at: Date;
  phone: string;
  userId?: string | null;
  userName?: string;
  title: string;
  detail: string;
}

interface Source {
  label: string;
  collection: string;
  /** The date the activity happened on. */
  dateField: string;
  /** Field holding the customer's phone, or null when the row points at a user id. */
  phoneField: string | null;
  base: Record<string, any>;
  projection: Record<string, 1>;
  toRow: (doc: any) => Omit<Row, 'id' | 'type' | 'at'>;
}

const words = (value: any) => (typeof value === 'string' && value ? value.replace(/_/g, ' ') : '');

/** Sign-ins by customers. Verifications made without a role (shared website sign-in) are included. */
const CUSTOMER_OTP = { type: 'verify', role: { $in: ['user', null] } };

const ADMIN_ACTIONS: Record<string, string> = {
  suspend: 'Account suspended',
  block: 'Account blocked',
  reactivate: 'Account reactivated',
  verify: 'Marked as verified by admin',
  unverify: 'Admin verification cleared',
  update: 'Profile updated by admin',
  delete: 'Account deleted',
};

const SOURCES: Record<string, Source> = {
  signup: {
    label: 'Sign-ups',
    collection: 'users',
    dateField: 'createdAt',
    phoneField: 'phone',
    base: {},
    projection: { phone: 1, name: 1, city: 1, status: 1, createdAt: 1 },
    toRow: (doc) => ({
      phone: doc.phone || '',
      userId: String(doc._id),
      userName: doc.name || '',
      title: 'Signed up',
      detail: [doc.city, doc.status === 'completed' ? 'profile completed' : 'profile not completed'].filter(Boolean).join(' · '),
    }),
  },
  signin: {
    label: 'Sign-ins',
    collection: 'otpEvents',
    dateField: 'createdAt',
    phoneField: 'phone',
    base: { ...CUSTOMER_OTP, success: true },
    projection: { phone: 1, role: 1, ip: 1, createdAt: 1 },
    toRow: (doc) => ({
      phone: doc.phone || '',
      title: 'Signed in with OTP',
      detail: doc.ip ? `From ${doc.ip}` : '',
    }),
  },
  signin_failed: {
    label: 'Failed sign-ins',
    collection: 'otpEvents',
    dateField: 'createdAt',
    phoneField: 'phone',
    base: { ...CUSTOMER_OTP, success: false },
    projection: { phone: 1, role: 1, ip: 1, createdAt: 1 },
    toRow: (doc) => ({
      phone: doc.phone || '',
      title: 'Sign-in failed (wrong or expired OTP)',
      detail: doc.ip ? `From ${doc.ip}` : '',
    }),
  },
  booking: {
    label: 'Bookings',
    collection: 'bookings',
    dateField: 'createdAt',
    phoneField: 'userPhone',
    base: {},
    projection: { userPhone: 1, eventTitle: 1, totalSeats: 1, totalPrice: 1, amountPaid: 1, status: 1, paymentStatus: 1, createdAt: 1 },
    toRow: (doc) => ({
      phone: doc.userPhone || '',
      title: `Booking created${doc.eventTitle ? ': ' + doc.eventTitle : ''}`,
      detail: [
        doc.totalSeats ? `${doc.totalSeats} seat${Number(doc.totalSeats) === 1 ? '' : 's'}` : '',
        `₹${parseAmount(doc.amountPaid ?? doc.totalPrice).toLocaleString('en-IN')}`,
        doc.status ? `status ${words(doc.status)}` : '',
        doc.paymentStatus ? `payment ${words(doc.paymentStatus)}` : '',
        `booking ${String(doc._id)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }),
  },
  cancellation: {
    label: 'Cancellations',
    collection: 'bookings',
    dateField: 'cancelledAt',
    phoneField: 'userPhone',
    base: { status: 'cancelled' },
    projection: { userPhone: 1, eventTitle: 1, cancelReason: 1, cancelledBy: 1, cancelledAt: 1 },
    toRow: (doc) => ({
      phone: doc.userPhone || '',
      title: `Booking cancelled${doc.eventTitle ? ': ' + doc.eventTitle : ''}`,
      detail: [
        doc.cancelledBy ? `by ${doc.cancelledBy}` : '',
        doc.cancelReason ? `reason: ${doc.cancelReason}` : '',
        `booking ${String(doc._id)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }),
  },
  support: {
    label: 'Support cases',
    collection: 'supportCases',
    dateField: 'createdAt',
    phoneField: 'customerPhone',
    base: {},
    projection: { customerPhone: 1, customerName: 1, kind: 1, subject: 1, status: 1, priority: 1, createdAt: 1 },
    toRow: (doc) => ({
      phone: doc.customerPhone || '',
      userName: doc.customerName || '',
      title: `${doc.kind === 'complaint' ? 'Complaint' : 'Support ticket'} raised: ${doc.subject || 'no subject'}`,
      detail: [doc.status ? `status ${words(doc.status)}` : '', doc.priority ? `priority ${doc.priority}` : '']
        .filter(Boolean)
        .join(' · '),
    }),
  },
  feedback: {
    label: 'Feedback',
    collection: 'feedback',
    dateField: 'createdAt',
    phoneField: 'customerPhone',
    base: {},
    projection: { customerPhone: 1, customerName: 1, targetType: 1, targetName: 1, rating: 1, status: 1, createdAt: 1 },
    toRow: (doc) => ({
      phone: doc.customerPhone || '',
      userName: doc.customerName || '',
      title: `Feedback given${doc.targetName ? ' on ' + doc.targetName : doc.targetType ? ' on the ' + doc.targetType : ''}`,
      detail: [doc.rating ? `${doc.rating} of 5` : '', doc.status ? `status ${words(doc.status)}` : ''].filter(Boolean).join(' · '),
    }),
  },
  report: {
    label: 'Reports against users',
    collection: 'userReports',
    dateField: 'createdAt',
    phoneField: 'reportedPhone',
    base: { reportedType: 'user' },
    projection: { reportedPhone: 1, reportedName: 1, reason: 1, status: 1, reporterPhone: 1, createdAt: 1 },
    toRow: (doc) => ({
      phone: doc.reportedPhone || '',
      userName: doc.reportedName || '',
      title: `Reported for ${words(doc.reason) || 'an unstated reason'}`,
      detail: [doc.status ? `status ${words(doc.status)}` : '', doc.reporterPhone ? `reported by ${doc.reporterPhone}` : '']
        .filter(Boolean)
        .join(' · '),
    }),
  },
  admin: {
    label: 'Admin actions',
    collection: 'auditLogs',
    dateField: 'createdAt',
    phoneField: null,
    base: { entityType: 'user' },
    projection: { action: 1, adminName: 1, adminEmail: 1, entityId: 1, entityLabel: 1, reason: 1, createdAt: 1 },
    toRow: (doc) => ({
      phone: '',
      userId: doc.entityId ? String(doc.entityId) : null,
      userName: doc.entityLabel || '',
      title: `${ADMIN_ACTIONS[doc.action] || words(doc.action) || 'Admin action'} by ${doc.adminName || doc.adminEmail || 'an admin'}`,
      detail: doc.reason ? `reason: ${doc.reason}` : '',
    }),
  },
};

const TYPE_KEYS = Object.keys(SOURCES);

/** Phones and ids of the accounts a `user` filter points at. */
async function resolveUser(db: Db, text: string) {
  const users = db.collection('users');
  const oid = /^[a-f0-9]{24}$/i.test(text) ? toObjectId(text) : null;
  const pattern = new RegExp(escapeRegex(text), 'i');
  const matches = await users
    .find(oid ? { _id: oid } : { $or: [{ name: pattern }, { phone: pattern }, { email: pattern }] }, {
      projection: { phone: 1, name: 1 },
    })
    .limit(USER_MATCH_LIMIT)
    .toArray();

  const phones = new Set<string>();
  const ids = new Set<string>();
  for (const user of matches) {
    ids.add(String(user._id));
    if (typeof user.phone === 'string' && user.phone) phones.add(user.phone);
  }
  // A phone number with bookings but no account must still be findable.
  const digits = text.replace(/[\s\-+()]/g, '');
  if (!oid && /^\d{8,15}$/.test(digits)) phones.add(digits);

  return {
    phones: [...phones],
    ids: [...ids],
    matched: matches.length,
    single: matches.length === 1 ? { id: String(matches[0]._id), name: matches[0].name || '', phone: matches[0].phone || '' } : null,
  };
}

export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'users:view');
  if (!check.ok) return check.response;

  const params = request.nextUrl.searchParams;

  const typeParam = asString(params.get('type'), 200);
  const types = typeParam ? typeParam.split(',').map((part) => part.trim()).filter(Boolean) : TYPE_KEYS;
  const unknown = types.find((type) => !SOURCES[type]);
  if (unknown) return fail(`Unknown activity type "${unknown}". Use: ${TYPE_KEYS.join(', ')}.`, 400);

  const fromText = asString(params.get('from'), 10);
  const toText = asString(params.get('to'), 10);
  const from = fromText ? parseDay(fromText) : null;
  const to = toText ? parseDay(toText) : null;
  if (fromText && !from) return fail('from must be a valid date (YYYY-MM-DD).', 400);
  if (toText && !to) return fail('to must be a valid date (YYYY-MM-DD).', 400);
  if (from && to && from.getTime() > to.getTime()) return fail('The start date must not be after the end date.', 400);

  const pageParam = params.get('page');
  const limitParam = params.get('limit');
  const page = pageParam === null ? 1 : Number(pageParam);
  const limit = limitParam === null ? 25 : Number(limitParam);
  if (!Number.isInteger(page) || page < 1) return fail('page must be a whole number from 1.', 400);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail('limit must be between 1 and 100.', 400);
  const depth = page * limit;
  if (depth > MAX_DEPTH) {
    return fail(`Only the latest ${MAX_DEPTH.toLocaleString('en-IN')} activities can be paged through. Narrow the dates, the type or the user.`, 400);
  }

  const userText = asString(params.get('user'), 100);

  try {
    const { db } = await connectToDatabase();
    const target = userText ? await resolveUser(db, userText) : null;

    // The date range is applied to the date the activity happened on. A real
    // date is always required, so rows without one never appear.
    const dateRange: Record<string, any> = { $type: 'date' };
    if (from) dateRange.$gte = from;
    if (to) dateRange.$lt = new Date(to.getTime() + DAY_MS);

    const filterFor = (source: Source): Record<string, any> | null => {
      const filter: Record<string, any> = { ...source.base, [source.dateField]: dateRange };
      if (target) {
        if (source.phoneField) {
          if (target.phones.length === 0) return null;
          filter[source.phoneField] = { $in: target.phones };
        } else {
          if (target.ids.length === 0) return null;
          filter.entityId = { $in: target.ids };
        }
      }
      return filter;
    };

    const perType = await Promise.all(
      TYPE_KEYS.map(async (type) => {
        const source = SOURCES[type];
        const filter = filterFor(source);
        if (!filter) return { type, count: 0, rows: [] as Row[] };
        const collection = db.collection(source.collection);
        const selected = types.includes(type);
        const [count, docs] = await Promise.all([
          collection.countDocuments(filter),
          selected
            ? collection
                .find(filter, { projection: source.projection })
                .sort({ [source.dateField]: -1, _id: -1 })
                .limit(depth)
                .toArray()
            : Promise.resolve([] as any[]),
        ]);
        const rows: Row[] = docs.map((doc) => ({
          id: `${type}:${String(doc._id)}`,
          type,
          at: doc[source.dateField],
          ...source.toRow(doc),
        }));
        return { type, count, rows };
      })
    );

    const counts: Record<string, number> = {};
    let total = 0;
    const merged: Row[] = [];
    for (const entry of perType) {
      counts[entry.type] = entry.count;
      if (types.includes(entry.type)) {
        total += entry.count;
        merged.push(...entry.rows);
      }
    }
    merged.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1));
    const rows = merged.slice((page - 1) * limit, page * limit);

    // Link each row to the customer's account where one exists.
    const phones = [...new Set(rows.map((row) => row.phone).filter(Boolean))];
    const ids = [...new Set(rows.map((row) => row.userId).filter(Boolean))]
      .map((id) => toObjectId(id as string))
      .filter(Boolean) as any[];
    const accounts =
      phones.length || ids.length
        ? await db
            .collection('users')
            .find(
              { $or: [...(phones.length ? [{ phone: { $in: phones } }] : []), ...(ids.length ? [{ _id: { $in: ids } }] : [])] },
              { projection: { phone: 1, name: 1 } }
            )
            .toArray()
        : [];
    const byPhone = new Map<string, any>();
    const byId = new Map<string, any>();
    for (const account of accounts) {
      byId.set(String(account._id), account);
      if (account.phone) byPhone.set(account.phone, account);
    }

    const reachable = Math.min(total, MAX_DEPTH);
    return ok({
      activities: rows.map((row) => {
        const account = (row.userId && byId.get(row.userId)) || (row.phone && byPhone.get(row.phone)) || null;
        return {
          id: row.id,
          type: row.type,
          at: row.at,
          title: row.title,
          detail: row.detail,
          phone: row.phone || account?.phone || '',
          userId: account ? String(account._id) : null,
          userName: account?.name || row.userName || '',
        };
      }),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(reachable / limit)),
      capped: total > MAX_DEPTH,
      maxRows: MAX_DEPTH,
      counts,
      types: TYPE_KEYS.map((key) => ({ value: key, label: SOURCES[key].label })),
      user: target ? { query: userText, matched: target.matched, account: target.single } : null,
    });
  } catch (error) {
    console.error('User activity error:', error);
    return fail('Failed to load user activity', 500);
  }
}
