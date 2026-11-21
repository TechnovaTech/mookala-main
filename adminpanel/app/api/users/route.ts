import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth';
import { ok, fail, escapeRegex, asString, toCsv, csvResponse } from '@/lib/http';
import { accountStatusOf } from '@/lib/user-status';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

/*
 * Views of User Management (requirements section 3).
 *
 *   active     not restricted and the profile is completed
 *   inactive   not restricted, signed up but the profile is not completed
 *              (`status` 'pending' or 'verified', or missing on old rows)
 *   suspended  restricted by an admin (or the old `isActive: false`)
 *   blocked    blocked by an admin
 *
 * The four views never overlap and together make up "all".
 */
const NOT_RESTRICTED = { accountStatus: { $nin: ['suspended', 'blocked'] }, isActive: { $ne: false } };

const VIEW_FILTERS: Record<string, Record<string, any>> = {
  all: {},
  active: { ...NOT_RESTRICTED, status: 'completed' },
  inactive: { ...NOT_RESTRICTED, status: { $ne: 'completed' } },
  suspended: {
    $or: [
      { accountStatus: 'suspended' },
      { accountStatus: { $nin: ['suspended', 'blocked'] }, isActive: false },
    ],
  },
  blocked: { accountStatus: 'blocked' },
};

/*
 * Verification groups used by /users/verification.
 * Phone verified through OTP = `status` 'verified' or 'completed'.
 */
const VERIFICATION_FILTERS: Record<string, Record<string, any>> = {
  phone_unverified: { status: { $nin: ['verified', 'completed'] } },
  phone_verified: { status: 'verified' },
  profile_completed: { status: 'completed' },
  admin_verified: { 'verifiedByAdmin.at': { $exists: true } },
};

// Never send the base64 profile image or the OTP to the list.
const LIST_PROJECTION = {
  phone: 1,
  name: 1,
  email: 1,
  city: 1,
  status: 1,
  isActive: 1,
  accountStatus: 1,
  accountStatusReason: 1,
  accountStatusBy: 1,
  accountStatusAt: 1,
  verifiedByAdmin: 1,
  genres: 1,
  createdAt: 1,
  updatedAt: 1,
};

const CSV_LIMIT = 5000;

function serialise(user: any) {
  const accountStatus = accountStatusOf(user);
  const signupStatus = user.status || 'pending';
  return {
    id: String(user._id),
    phone: user.phone || '',
    name: user.name || '',
    email: user.email || '',
    city: user.city || '',
    status: signupStatus,
    phoneVerified: signupStatus === 'verified' || signupStatus === 'completed',
    profileCompleted: signupStatus === 'completed',
    accountStatus,
    isActive: accountStatus === 'active',
    accountStatusReason: user.accountStatusReason || null,
    accountStatusBy: user.accountStatusBy || null,
    accountStatusAt: user.accountStatusAt || null,
    verifiedByAdmin: user.verifiedByAdmin?.at ? user.verifiedByAdmin : null,
    genres: Array.isArray(user.genres) ? user.genres : [],
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

async function countEach(collection: any, base: Record<string, any>[], filters: Record<string, Record<string, any>>) {
  const keys = Object.keys(filters);
  const values = await Promise.all(
    keys.map((key) => {
      const parts = [...base, filters[key]].filter((part) => Object.keys(part).length);
      return collection.countDocuments(parts.length ? { $and: parts } : {});
    })
  );
  return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
}

/**
 * GET /api/users
 *   q             search in name, phone and email
 *   view          all | active | inactive | suspended | blocked
 *   verification  phone_unverified | phone_verified | profile_completed | admin_verified
 *   page, limit   paging (limit 1 to 100, default 25)
 *   format=csv    downloads the current view (up to 5,000 rows)
 */
export async function GET(request: NextRequest) {
  const check = await requireAdmin(request, 'users:view');
  if (!check.ok) return check.response;

  try {
    const params = request.nextUrl.searchParams;
    const view = asString(params.get('view'), 30) || 'all';
    const verification = asString(params.get('verification'), 30);
    const q = asString(params.get('q'), 100);

    if (!VIEW_FILTERS[view]) return fail('Unknown view. Use all, active, inactive, suspended or blocked.', 400);
    if (verification && !VERIFICATION_FILTERS[verification]) {
      return fail('Unknown verification group.', 400);
    }

    const pageParam = params.get('page');
    const limitParam = params.get('limit');
    const page = pageParam === null ? 1 : Number(pageParam);
    const limit = limitParam === null ? 25 : Number(limitParam);
    if (!Number.isInteger(page) || page < 1) return fail('page must be a whole number from 1.', 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail('limit must be between 1 and 100.', 400);

    const search: Record<string, any>[] = [];
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      search.push({ $or: [{ name: pattern }, { phone: pattern }, { email: pattern }] });
    }

    const parts = [...search, VIEW_FILTERS[view], verification ? VERIFICATION_FILTERS[verification] : {}].filter(
      (part) => Object.keys(part).length
    );
    const filter = parts.length ? { $and: parts } : {};

    const { db } = await connectToDatabase();
    const collection = db.collection('users');

    if (params.get('format') === 'csv') {
      const rows = await collection
        .find(filter, { projection: LIST_PROJECTION })
        .sort({ createdAt: -1, _id: -1 })
        .limit(CSV_LIMIT)
        .toArray();
      const csv = toCsv(
        rows.map((row) => {
          const user = serialise(row);
          return {
            ...user,
            phoneVerified: user.phoneVerified ? 'Yes' : 'No',
            profileCompleted: user.profileCompleted ? 'Yes' : 'No',
            verifiedByAdmin: user.verifiedByAdmin ? 'Yes' : 'No',
            verifiedByAdminBy: user.verifiedByAdmin?.by || '',
            genres: user.genres.join('; '),
          };
        }),
        [
          { key: 'name', label: 'Name' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'city', label: 'City' },
          { key: 'status', label: 'Signup stage' },
          { key: 'phoneVerified', label: 'Phone verified' },
          { key: 'profileCompleted', label: 'Profile completed' },
          { key: 'verifiedByAdmin', label: 'Verified by admin' },
          { key: 'verifiedByAdminBy', label: 'Verified by' },
          { key: 'accountStatus', label: 'Account status' },
          { key: 'accountStatusReason', label: 'Last status change reason' },
          { key: 'accountStatusBy', label: 'Status changed by' },
          { key: 'accountStatusAt', label: 'Status changed at' },
          { key: 'genres', label: 'Genres' },
          { key: 'createdAt', label: 'Joined' },
          { key: 'id', label: 'User ID' },
        ]
      );
      const name = verification ? `users-${verification}` : `users-${view}`;
      return csvResponse(csv, `${name}-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    // Tab counts follow the search box, but not the tab that is selected.
    const [users, total, counts, verificationCounts] = await Promise.all([
      collection
        .find(filter, { projection: LIST_PROJECTION })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
      countEach(collection, search, VIEW_FILTERS),
      countEach(collection, search, VERIFICATION_FILTERS),
    ]);

    return ok({
      users: users.map(serialise),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts,
      verificationCounts,
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    return fail('Failed to fetch users', 500);
  }
}
