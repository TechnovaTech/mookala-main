import type { Db } from 'mongodb';
import { accountStatusOf } from './user-status';
import { toObjectId } from './http';

/**
 * Risk signals (requirements section 17).
 *
 * A signal is a lead for a person to review. It is computed on demand from the
 * data that already exists, is never stored as a verdict and never changes an
 * account: nothing in this file writes to users, artists, organisers, bookings
 * or payments. "Automated flags should not automatically imply guilt."
 *
 * Thresholds live in the `settings` document { type: 'risk' } and fall back to
 * DEFAULT_RISK_SETTINGS below.
 */

export const RISK_SETTINGS_TYPE = 'risk';

export type SignalSeverity = 'low' | 'medium' | 'high';

export type SignalGroupKey =
  | 'multiple_accounts'
  | 'account_activity'
  | 'seller_risk'
  | 'payment_risk'
  | 'otp_abuse'
  | 'refund_patterns';

export type SubjectType = 'user' | 'artist' | 'organizer' | 'phone' | 'ip' | 'booking' | 'payment' | 'payee';

export interface RelatedAccount {
  type: SubjectType;
  id: string;
  label: string;
  href: string | null;
}

export interface RiskSignal {
  /** Stable id of the signal, e.g. "duplicate_email:a@b.com". A case opened from a signal stores it. */
  key: string;
  group: SignalGroupKey;
  /** The detector that produced it. */
  detector: string;
  title: string;
  severity: SignalSeverity;
  subjectType: SubjectType;
  subjectId: string;
  subjectLabel: string;
  /** One factual sentence with the numbers behind the signal. */
  evidence: string;
  detectedAt: string;
  /** Page where the account or record can be reviewed, when there is one. */
  href: string | null;
  /** Every account involved, for signals about more than one account. */
  related?: RelatedAccount[];
  openCase?: { id: string; status: string } | null;
}

export interface RiskSettings {
  /** Bookings by one phone inside the window that count as a burst. */
  bookingBurstCount: number;
  bookingBurstWindowMinutes: number;
  /** How far back bookings are scanned for bursts and restricted-account bookings. */
  activityLookbackDays: number;
  /** Failed payment ledger entries for one phone in 24 hours. */
  failedPaymentsIn24h: number;
  otpSendsPerPhonePerHour: number;
  otpFailedVerifiesPerPhonePerHour: number;
  otpSendsPerIpPerHour: number;
  otpFailedVerifiesPerIpPerHour: number;
  /** Cancellations, or refund requests, by one phone in 30 days. */
  cancellationsIn30Days: number;
  /** A payee is only judged once it has at least this many payments. */
  refundShareMinPayments: number;
  /** Refunds as a percentage of a payee's payments (by number of payments). */
  refundSharePercent: number;
  /** Times a profile went from approved to rejected. */
  approvalReversals: number;
}

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  bookingBurstCount: 5,
  bookingBurstWindowMinutes: 60,
  activityLookbackDays: 30,
  failedPaymentsIn24h: 3,
  otpSendsPerPhonePerHour: 5,
  otpFailedVerifiesPerPhonePerHour: 5,
  otpSendsPerIpPerHour: 15,
  otpFailedVerifiesPerIpPerHour: 15,
  cancellationsIn30Days: 3,
  refundShareMinPayments: 10,
  refundSharePercent: 30,
  approvalReversals: 2,
};

export interface RiskSettingField {
  key: keyof RiskSettings;
  label: string;
  help: string;
  min: number;
  max: number;
  group: SignalGroupKey;
}

/** Drives both the server validation and the form on the Risk Overview page. */
export const RISK_SETTING_FIELDS: RiskSettingField[] = [
  { key: 'bookingBurstCount', label: 'Bookings that count as a burst', help: 'Bookings made by one phone number inside the window below.', min: 2, max: 500, group: 'account_activity' },
  { key: 'bookingBurstWindowMinutes', label: 'Burst window (minutes)', help: 'Length of the rolling window used to count bookings.', min: 1, max: 1440, group: 'account_activity' },
  { key: 'activityLookbackDays', label: 'Booking look-back (days)', help: 'How far back bookings are checked.', min: 1, max: 365, group: 'account_activity' },
  { key: 'failedPaymentsIn24h', label: 'Failed payments in 24 hours', help: 'Failed payment ledger entries for one phone number.', min: 2, max: 100, group: 'payment_risk' },
  { key: 'otpSendsPerPhonePerHour', label: 'OTP sends per phone per hour', help: 'OTP messages requested for one phone number in any 60 minutes.', min: 2, max: 500, group: 'otp_abuse' },
  { key: 'otpFailedVerifiesPerPhonePerHour', label: 'Failed OTP checks per phone per hour', help: 'Wrong codes entered for one phone number in any 60 minutes.', min: 2, max: 500, group: 'otp_abuse' },
  { key: 'otpSendsPerIpPerHour', label: 'OTP sends per IP address per hour', help: 'OTP messages requested from one IP address in any 60 minutes.', min: 2, max: 5000, group: 'otp_abuse' },
  { key: 'otpFailedVerifiesPerIpPerHour', label: 'Failed OTP checks per IP address per hour', help: 'Wrong codes entered from one IP address in any 60 minutes.', min: 2, max: 5000, group: 'otp_abuse' },
  { key: 'cancellationsIn30Days', label: 'Cancellations or refund requests in 30 days', help: 'Cancelled bookings, or refund requests, by one phone number.', min: 2, max: 100, group: 'refund_patterns' },
  { key: 'refundShareMinPayments', label: 'Minimum payments before judging a payee', help: 'A payee with fewer successful payments than this is never flagged for refund share.', min: 1, max: 10000, group: 'refund_patterns' },
  { key: 'refundSharePercent', label: 'Refund share (%)', help: 'Refunds as a percentage of the payee’s payments, by number of payments.', min: 1, max: 100, group: 'refund_patterns' },
  { key: 'approvalReversals', label: 'Approval reversals', help: 'Times a profile was approved and later rejected, from the activity log.', min: 1, max: 20, group: 'seller_risk' },
];

export const SIGNAL_GROUPS: { key: SignalGroupKey; label: string; description: string }[] = [
  { key: 'multiple_accounts', label: 'Multiple accounts', description: 'One email address on several user accounts, or one Aadhaar or PAN number on several artist or organiser accounts. One phone number used as user, artist and organiser is normal and is not flagged.' },
  { key: 'account_activity', label: 'Account activity', description: 'Many bookings from one phone number in a short time, and bookings from accounts that are suspended or blocked.' },
  { key: 'seller_risk', label: 'Artist and organiser verification', description: 'Approved profiles with no KYC documents on file, profiles with open reports, and profiles approved and then rejected more than once.' },
  { key: 'payment_risk', label: 'Payments', description: 'Repeated failed payments, bookings marked paid that were never confirmed with the gateway, and disputed payments.' },
  { key: 'otp_abuse', label: 'OTP requests', description: 'Many OTP requests or wrong codes for one phone number or from one IP address within an hour.' },
  { key: 'refund_patterns', label: 'Cancellations and refunds', description: 'Repeated cancellations or refund requests by one phone number, and payees with a high share of refunded payments.' },
];

const MAX_SIGNALS_PER_DETECTOR = 100;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/** Validates submitted thresholds. Unknown keys are ignored. Returns the cleaned values or an error. */
export function validateRiskSettings(input: any): { values: Partial<RiskSettings>; error: string | null } {
  const values: Partial<RiskSettings> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { values, error: 'Invalid request body' };

  for (const field of RISK_SETTING_FIELDS) {
    if (!(field.key in input)) continue;
    const raw = input[field.key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isInteger(value)) return { values, error: `${field.label} must be a whole number` };
    if (value < field.min || value > field.max) {
      return { values, error: `${field.label} must be between ${field.min} and ${field.max}` };
    }
    values[field.key] = value;
  }
  return { values, error: null };
}

export async function getRiskSettings(db: Db): Promise<{ settings: RiskSettings; updatedAt: Date | null; updatedBy: string | null }> {
  const doc = await db.collection('settings').findOne({ type: RISK_SETTINGS_TYPE });
  const settings: RiskSettings = { ...DEFAULT_RISK_SETTINGS };
  if (doc) {
    const { values } = validateRiskSettings(
      Object.fromEntries(RISK_SETTING_FIELDS.filter((f) => typeof doc[f.key] === 'number').map((f) => [f.key, doc[f.key]]))
    );
    Object.assign(settings, values);
  }
  return { settings, updatedAt: doc?.updatedAt ? new Date(doc.updatedAt) : null, updatedBy: doc?.updatedBy || null };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toTime(value: any): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/** Matches a date field stored as a Date, or as ISO text on older rows. */
function since(field: string, from: Date) {
  return { $or: [{ [field]: { $gte: from } }, { [field]: { $type: 'string', $gte: from.toISOString() } }] };
}

/** Last four characters of an identity number. The full number is never returned. */
export function lastFour(value: string): string {
  const clean = String(value || '').replace(/[^A-Za-z0-9]/g, '');
  return clean.length <= 4 ? '••••' : '•••• ' + clean.slice(-4);
}

function normaliseIdNumber(value: any): string {
  return typeof value === 'string' ? value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
}

function fmt(time: number): string {
  return new Date(time).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
}

function rupees(value: number): string {
  return '₹' + (Math.round(value * 100) / 100).toLocaleString('en-IN');
}

/** The busiest rolling window in a list of timestamps. */
export function peakWindow(times: number[], windowMs: number): { count: number; start: number; end: number } {
  const sorted = [...times].sort((a, b) => a - b);
  let best = { count: 0, start: 0, end: 0 };
  let left = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > windowMs) left++;
    const count = right - left + 1;
    if (count > best.count) best = { count, start: sorted[left], end: sorted[right] };
  }
  return best;
}

function accountHref(type: SubjectType, id: string): string | null {
  if (!id) return null;
  if (type === 'user') return `/users/${id}`;
  if (type === 'artist') return `/artists/${id}`;
  if (type === 'organizer') return `/organizers/${id}`;
  return null;
}

const ROLE_LABEL: Record<string, string> = { user: 'User', artist: 'Artist', organizer: 'Organiser' };

function accountLabel(doc: any, fallback: string): string {
  return [doc?.name || fallback, doc?.phone].filter(Boolean).join(' · ');
}

interface PhoneDirectory {
  subject(phone: string): { subjectType: SubjectType; subjectId: string; subjectLabel: string; href: string | null };
}

/** Resolves phone numbers to user accounts so a signal can link to the account. */
async function phoneDirectory(db: Db, phones: string[]): Promise<PhoneDirectory> {
  const unique = Array.from(new Set(phones.filter((p) => typeof p === 'string' && p)));
  const users = unique.length
    ? await db.collection('users').find({ phone: { $in: unique } }, { projection: { phone: 1, name: 1 } }).toArray()
    : [];
  const byPhone = new Map(users.map((u) => [u.phone, u]));
  return {
    subject(phone: string) {
      const user = byPhone.get(phone);
      if (user) {
        return { subjectType: 'user', subjectId: String(user._id), subjectLabel: accountLabel(user, 'User'), href: `/users/${user._id}` };
      }
      return { subjectType: 'phone', subjectId: phone, subjectLabel: phone, href: `/bookings?q=${encodeURIComponent(phone)}` };
    },
  };
}

function now(): string {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* 1. Multiple accounts                                                */
/* ------------------------------------------------------------------ */

async function detectDuplicateEmails(db: Db): Promise<RiskSignal[]> {
  const groups = await db
    .collection('users')
    .aggregate([
      { $match: { email: { $type: 'string', $ne: '' } } },
      { $project: { email: { $toLower: { $trim: { input: '$email' } } }, name: 1, phone: 1 } },
      { $match: { email: { $ne: '' } } },
      { $group: { _id: '$email', count: { $sum: 1 }, accounts: { $push: { id: '$_id', name: '$name', phone: '$phone' } } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: MAX_SIGNALS_PER_DETECTOR },
    ])
    .toArray();

  return groups.map((group) => {
    const accounts: any[] = group.accounts.slice(0, 20);
    const phones = accounts.map((a) => a.phone).filter(Boolean);
    return {
      key: `duplicate_email:${group._id}`,
      group: 'multiple_accounts' as const,
      detector: 'duplicate_email',
      title: 'One email address on several user accounts',
      severity: group.count >= 4 ? ('high' as const) : ('medium' as const),
      subjectType: 'user' as const,
      subjectId: String(accounts[0].id),
      subjectLabel: String(group._id),
      evidence: `The email ${group._id} is registered on ${group.count} user accounts (phones: ${phones.join(', ') || 'not recorded'}).`,
      detectedAt: now(),
      href: `/users/${accounts[0].id}`,
      related: accounts.map((a) => ({ type: 'user' as const, id: String(a.id), label: accountLabel(a, 'User'), href: `/users/${a.id}` })),
    };
  });
}

async function detectSharedIdentityNumbers(db: Db): Promise<RiskSignal[]> {
  const projection = { name: 1, phone: 1, aadharId: 1, panId: 1 };
  const filter = { $or: [{ aadharId: { $type: 'string', $ne: '' } }, { panId: { $type: 'string', $ne: '' } }] };
  const [artists, organizers] = await Promise.all([
    db.collection('artists').find(filter, { projection }).toArray(),
    db.collection('organizers').find(filter, { projection }).toArray(),
  ]);

  type Account = { type: 'artist' | 'organizer'; id: string; name: string; phone: string };
  const byNumber = new Map<string, { kind: 'Aadhaar' | 'PAN'; number: string; accounts: Account[] }>();

  const add = (kind: 'Aadhaar' | 'PAN', raw: any, account: Account) => {
    const number = normaliseIdNumber(raw);
    if (number.length < 6) return; // too short to be a real identity number
    const mapKey = `${kind}:${number}`;
    if (!byNumber.has(mapKey)) byNumber.set(mapKey, { kind, number, accounts: [] });
    byNumber.get(mapKey)!.accounts.push(account);
  };

  for (const doc of artists) {
    const account: Account = { type: 'artist', id: String(doc._id), name: doc.name || '', phone: doc.phone || '' };
    add('Aadhaar', doc.aadharId, account);
    add('PAN', doc.panId, account);
  }
  for (const doc of organizers) {
    const account: Account = { type: 'organizer', id: String(doc._id), name: doc.name || '', phone: doc.phone || '' };
    add('Aadhaar', doc.aadharId, account);
    add('PAN', doc.panId, account);
  }

  const signals: RiskSignal[] = [];
  for (const entry of Array.from(byNumber.values())) {
    if (entry.accounts.length < 2) continue;
    // One person who is both an artist and an organiser registers the same
    // document under the same phone number. That is a dual role, not a signal.
    const phones = new Set(entry.accounts.map((a) => a.phone || `no-phone:${a.type}:${a.id}`));
    if (phones.size < 2) continue;

    const tail = entry.number.slice(-4);
    const sorted = [...entry.accounts].sort((a, b) => a.id.localeCompare(b.id));
    signals.push({
      // The key holds only the last four characters and the account ids, never the number.
      key: `shared_${entry.kind.toLowerCase()}:${tail}:${sorted.map((a) => a.id).join('+')}`,
      group: 'multiple_accounts',
      detector: entry.kind === 'PAN' ? 'shared_pan' : 'shared_aadhaar',
      title: `One ${entry.kind} number on several accounts`,
      severity: 'high',
      subjectType: sorted[0].type,
      subjectId: sorted[0].id,
      subjectLabel: `${entry.kind} ending ${tail}`,
      evidence:
        `${entry.kind} number ${lastFour(entry.number)} is stored on ${entry.accounts.length} accounts with ${phones.size} different phone numbers: ` +
        sorted.map((a) => `${ROLE_LABEL[a.type]} ${a.name || 'unnamed'} (${a.phone || 'no phone'})`).join('; ') + '.',
      detectedAt: now(),
      href: accountHref(sorted[0].type, sorted[0].id),
      related: sorted.map((a) => ({
        type: a.type,
        id: a.id,
        label: `${ROLE_LABEL[a.type]}: ${[a.name || 'unnamed', a.phone].filter(Boolean).join(' · ')}`,
        href: accountHref(a.type, a.id),
      })),
    });
    if (signals.length >= MAX_SIGNALS_PER_DETECTOR) break;
  }
  return signals;
}

/* ------------------------------------------------------------------ */
/* 2. Suspicious account activity                                      */
/* ------------------------------------------------------------------ */

async function detectBookingBursts(db: Db, settings: RiskSettings): Promise<RiskSignal[]> {
  const from = new Date(Date.now() - settings.activityLookbackDays * DAY);
  const candidates = await db
    .collection('bookings')
    .aggregate([
      { $match: { userPhone: { $type: 'string', $ne: '' }, ...since('createdAt', from) } },
      { $group: { _id: '$userPhone', count: { $sum: 1 }, times: { $push: '$createdAt' } } },
      { $match: { count: { $gte: settings.bookingBurstCount } } },
      { $sort: { count: -1 } },
      { $limit: 500 },
    ])
    .toArray();

  const windowMs = settings.bookingBurstWindowMinutes * 60 * 1000;
  const hits: { phone: string; peak: ReturnType<typeof peakWindow>; total: number }[] = [];
  for (const row of candidates) {
    const times = (row.times as any[]).map(toTime).filter((t): t is number => t !== null);
    const peak = peakWindow(times, windowMs);
    if (peak.count >= settings.bookingBurstCount) hits.push({ phone: row._id, peak, total: row.count });
  }

  const directory = await phoneDirectory(db, hits.map((h) => h.phone));
  return hits.slice(0, MAX_SIGNALS_PER_DETECTOR).map((hit) => {
    const minutes = Math.max(1, Math.round((hit.peak.end - hit.peak.start) / 60000));
    return {
      key: `booking_burst:${hit.phone}:${new Date(hit.peak.start).toISOString().slice(0, 10)}`,
      group: 'account_activity' as const,
      detector: 'booking_burst',
      title: 'Many bookings in a short time',
      severity: hit.peak.count >= settings.bookingBurstCount * 2 ? ('high' as const) : ('medium' as const),
      ...directory.subject(hit.phone),
      evidence:
        `${hit.peak.count} bookings were created by ${hit.phone} within ${minutes} minute${minutes === 1 ? '' : 's'} starting ${fmt(hit.peak.start)} ` +
        `(threshold: ${settings.bookingBurstCount} in ${settings.bookingBurstWindowMinutes} minutes; ${hit.total} bookings in the last ${settings.activityLookbackDays} days).`,
      detectedAt: now(),
    };
  });
}

async function detectRestrictedAccountBookings(db: Db, settings: RiskSettings): Promise<RiskSignal[]> {
  const restricted = await db
    .collection('users')
    .find(
      { $or: [{ accountStatus: { $in: ['suspended', 'blocked'] } }, { isActive: false }] },
      { projection: { phone: 1, name: 1, accountStatus: 1, isActive: 1, accountStatusChangedAt: 1, accountStatusAt: 1, suspendedAt: 1, blockedAt: 1, statusChangedAt: 1 } }
    )
    .limit(2000)
    .toArray();
  const withPhone = restricted.filter((u) => typeof u.phone === 'string' && u.phone);
  if (withPhone.length === 0) return [];

  const from = new Date(Date.now() - settings.activityLookbackDays * DAY);
  const bookings = await db
    .collection('bookings')
    .find(
      { userPhone: { $in: withPhone.map((u) => u.phone) }, ...since('createdAt', from) },
      { projection: { userPhone: 1, createdAt: 1 } }
    )
    .limit(20000)
    .toArray();
  if (bookings.length === 0) return [];

  // When the user document carries no restriction date, the activity log may.
  const ids = withPhone.map((u) => String(u._id));
  const logged = await db
    .collection('auditLogs')
    .find(
      { entityId: { $in: ids }, 'after.accountStatus': { $in: ['suspended', 'blocked'] } },
      { projection: { entityId: 1, createdAt: 1 } }
    )
    .sort({ createdAt: -1 })
    .limit(5000)
    .toArray();
  const loggedAt = new Map<string, number>();
  for (const entry of logged) {
    const time = toTime(entry.createdAt);
    if (time !== null && !loggedAt.has(entry.entityId)) loggedAt.set(entry.entityId, time);
  }

  const signals: RiskSignal[] = [];
  for (const user of withPhone) {
    const restrictedAt =
      toTime(user.accountStatusChangedAt) ?? toTime(user.accountStatusAt) ?? toTime(user.blockedAt) ?? toTime(user.suspendedAt) ?? toTime(user.statusChangedAt) ?? loggedAt.get(String(user._id)) ?? null;
    const mine = bookings.filter((b) => b.userPhone === user.phone).map((b) => toTime(b.createdAt)).filter((t): t is number => t !== null);
    const after = restrictedAt === null ? mine : mine.filter((t) => t >= restrictedAt);
    if (after.length === 0) continue;

    const status = accountStatusOf(user);
    const latest = Math.max(...after);
    signals.push({
      key: `restricted_account_booking:${user._id}`,
      group: 'account_activity',
      detector: 'restricted_account_booking',
      title: `Bookings from a ${status} account`,
      severity: restrictedAt === null ? 'medium' : 'high',
      subjectType: 'user',
      subjectId: String(user._id),
      subjectLabel: accountLabel(user, 'User'),
      evidence:
        restrictedAt === null
          ? `The account ${user.phone} is ${status} and has ${after.length} booking${after.length === 1 ? '' : 's'} in the last ${settings.activityLookbackDays} days (latest ${fmt(latest)}). The date of the restriction is not recorded, so some of these may have been made before it.`
          : `The account ${user.phone} has been ${status} since ${fmt(restrictedAt)} and ${after.length} booking${after.length === 1 ? ' was' : 's were'} created after that (latest ${fmt(latest)}).`,
      detectedAt: now(),
      href: `/users/${user._id}`,
    });
    if (signals.length >= MAX_SIGNALS_PER_DETECTOR) break;
  }
  return signals;
}

/* ------------------------------------------------------------------ */
/* 3. Fake artist / seller risk                                        */
/* ------------------------------------------------------------------ */

const BLANK = { $in: [null, ''] };

async function detectApprovedWithoutKyc(db: Db): Promise<RiskSignal[]> {
  const signals: RiskSignal[] = [];
  for (const [collection, type] of [['artists', 'artist'], ['organizers', 'organizer']] as const) {
    // The images are large, so only whether they exist is computed in the database.
    const present = (field: string) => ({ $gt: [{ $strLenCP: { $convert: { input: `$${field}`, to: 'string', onError: 'x', onNull: '' } } }, 0] });
    const rows = await db
      .collection(collection)
      .aggregate([
        {
          $match: {
            kycStatus: 'approved',
            $or: [{ aadharId: BLANK, panId: BLANK }, { aadharImage: BLANK, panImage: BLANK }],
          },
        },
        { $limit: MAX_SIGNALS_PER_DETECTOR },
        {
          $project: {
            name: 1, phone: 1,
            hasAadharId: present('aadharId'), hasPanId: present('panId'),
            hasAadharImage: present('aadharImage'), hasPanImage: present('panImage'),
          },
        },
      ])
      .toArray();

    for (const row of rows) {
      const noNumbers = !row.hasAadharId && !row.hasPanId;
      const noImages = !row.hasAadharImage && !row.hasPanImage;
      const missing = noNumbers && noImages
        ? 'no Aadhaar or PAN number and no document image'
        : noNumbers
        ? 'no Aadhaar or PAN number (a document image is on file)'
        : 'no Aadhaar or PAN document image (a number is on file)';
      signals.push({
        key: `approved_without_kyc:${type}:${row._id}`,
        group: 'seller_risk',
        detector: 'approved_without_kyc',
        title: `Approved ${ROLE_LABEL[type].toLowerCase()} with KYC documents missing`,
        severity: noNumbers && noImages ? 'high' : 'medium',
        subjectType: type,
        subjectId: String(row._id),
        subjectLabel: accountLabel(row, ROLE_LABEL[type]),
        evidence: `${ROLE_LABEL[type]} ${row.name || 'unnamed'} (${row.phone || 'no phone'}) has KYC status "approved" but ${missing}.`,
        detectedAt: now(),
        href: accountHref(type, String(row._id)),
      });
    }
  }
  return signals;
}

async function detectReportedSellers(db: Db): Promise<RiskSignal[]> {
  const groups = await db
    .collection('userReports')
    .aggregate([
      { $match: { status: { $in: ['open', 'under_review', 'escalated'] }, reportedType: { $in: ['artist', 'organizer'] } } },
      {
        $group: {
          _id: { type: '$reportedType', who: { $ifNull: ['$reportedPhone', '$reportedName'] } },
          count: { $sum: 1 },
          reasons: { $addToSet: '$reason' },
          name: { $first: '$reportedName' },
          phone: { $first: '$reportedPhone' },
          latest: { $max: '$createdAt' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: MAX_SIGNALS_PER_DETECTOR },
    ])
    .toArray();

  const signals: RiskSignal[] = [];
  for (const group of groups) {
    const type = group._id.type as 'artist' | 'organizer';
    const account = group.phone
      ? await db.collection(type === 'artist' ? 'artists' : 'organizers').findOne({ phone: group.phone }, { projection: { name: 1, phone: 1 } })
      : null;
    const latest = toTime(group.latest);
    signals.push({
      key: `open_reports:${type}:${group._id.who}`,
      group: 'seller_risk',
      detector: 'open_reports',
      title: `${ROLE_LABEL[type]} with open reports`,
      severity: group.count >= 3 ? 'high' : 'medium',
      subjectType: type,
      subjectId: account ? String(account._id) : String(group._id.who || ''),
      subjectLabel: account ? accountLabel(account, ROLE_LABEL[type]) : [group.name, group.phone].filter(Boolean).join(' · '),
      evidence:
        `${group.count} report${group.count === 1 ? '' : 's'} against ${ROLE_LABEL[type].toLowerCase()} ${group.name || group.phone || 'unnamed'} ${group.count === 1 ? 'is' : 'are'} still open ` +
        `(reasons given: ${(group.reasons as string[]).filter(Boolean).join(', ') || 'none recorded'}${latest ? `; latest ${fmt(latest)}` : ''}).` +
        (account ? '' : ' No matching account was found for the reported phone number.'),
      detectedAt: now(),
      href: account ? accountHref(type, String(account._id)) : '/support/reports',
    });
  }
  return signals;
}

async function detectApprovalReversals(db: Db, settings: RiskSettings): Promise<RiskSignal[]> {
  // Reads KYC decisions from the activity log: entries whose `after.kycStatus`
  // is approved or rejected on an artist or organiser record.
  const entries = await db
    .collection('auditLogs')
    .find(
      { 'after.kycStatus': { $in: ['approved', 'rejected'] }, entityId: { $ne: null } },
      { projection: { entityType: 1, entityId: 1, entityLabel: 1, 'after.kycStatus': 1, createdAt: 1 } }
    )
    .sort({ createdAt: 1 })
    .limit(20000)
    .toArray();

  const bySubject = new Map<string, { type: 'artist' | 'organizer'; id: string; label: string; decisions: { status: string; at: number }[] }>();
  for (const entry of entries) {
    const type: 'artist' | 'organizer' = /organi[sz]er/i.test(String(entry.entityType)) ? 'organizer' : 'artist';
    if (type === 'artist' && !/artist|kyc/i.test(String(entry.entityType))) continue;
    const mapKey = `${type}:${entry.entityId}`;
    if (!bySubject.has(mapKey)) bySubject.set(mapKey, { type, id: String(entry.entityId), label: entry.entityLabel || '', decisions: [] });
    const at = toTime(entry.createdAt);
    if (at !== null) bySubject.get(mapKey)!.decisions.push({ status: entry.after.kycStatus, at });
  }

  const signals: RiskSignal[] = [];
  for (const subject of Array.from(bySubject.values())) {
    let reversals = 0;
    let approvals = 0;
    let lastReversal = 0;
    for (let i = 0; i < subject.decisions.length; i++) {
      if (subject.decisions[i].status === 'approved') approvals++;
      if (i > 0 && subject.decisions[i].status === 'rejected' && subject.decisions[i - 1].status === 'approved') {
        reversals++;
        lastReversal = subject.decisions[i].at;
      }
    }
    if (reversals < settings.approvalReversals) continue;

    const isId = Boolean(toObjectId(subject.id));
    signals.push({
      key: `approval_reversals:${subject.type}:${subject.id}`,
      group: 'seller_risk',
      detector: 'approval_reversals',
      title: `${ROLE_LABEL[subject.type]} approved and then rejected repeatedly`,
      severity: 'medium',
      subjectType: subject.type,
      subjectId: subject.id,
      subjectLabel: subject.label || subject.id,
      evidence:
        `The activity log shows ${approvals} approval${approvals === 1 ? '' : 's'} and ${reversals} later rejection${reversals === 1 ? '' : 's'} ` +
        `for ${ROLE_LABEL[subject.type].toLowerCase()} ${subject.label || subject.id} (latest rejection ${fmt(lastReversal)}; threshold: ${settings.approvalReversals}).`,
      detectedAt: now(),
      href: isId ? accountHref(subject.type, subject.id) : null,
    });
    if (signals.length >= MAX_SIGNALS_PER_DETECTOR) break;
  }
  return signals;
}

/* ------------------------------------------------------------------ */
/* 4. Payment risk                                                     */
/* ------------------------------------------------------------------ */

async function detectFailedPayments(db: Db, settings: RiskSettings): Promise<RiskSignal[]> {
  const from = new Date(Date.now() - DAY);
  const groups = await db
    .collection('transactions')
    .aggregate([
      { $match: { type: 'payment', status: 'failed', customerPhone: { $type: 'string', $ne: '' }, createdAt: { $gte: from } } },
      { $group: { _id: '$customerPhone', count: { $sum: 1 }, amount: { $sum: '$amount' }, latest: { $max: '$createdAt' } } },
      { $match: { count: { $gte: settings.failedPaymentsIn24h } } },
      { $sort: { count: -1 } },
      { $limit: MAX_SIGNALS_PER_DETECTOR },
    ])
    .toArray();

  const directory = await phoneDirectory(db, groups.map((g) => g._id));
  return groups.map((group) => ({
    key: `failed_payments:${group._id}:${new Date().toISOString().slice(0, 10)}`,
    group: 'payment_risk' as const,
    detector: 'failed_payments',
    title: 'Repeated failed payments',
    severity: group.count >= settings.failedPaymentsIn24h * 2 ? ('high' as const) : ('medium' as const),
    ...directory.subject(group._id),
    evidence:
      `${group.count} failed payment entries totalling ${rupees(group.amount || 0)} were recorded for ${group._id} in the last 24 hours ` +
      `(latest ${fmt(toTime(group.latest) || Date.now())}; threshold: ${settings.failedPaymentsIn24h}).`,
    detectedAt: now(),
  }));
}

async function detectUnverifiedPaidBookings(db: Db): Promise<RiskSignal[]> {
  const groups = await db
    .collection('bookings')
    .aggregate([
      { $match: { paymentStatus: 'unverified', status: { $in: ['confirmed', 'attended', 'paid', 'completed'] } } },
      {
        $group: {
          _id: { $ifNull: ['$userPhone', ''] },
          count: { $sum: 1 },
          amounts: { $push: { $ifNull: ['$amountPaid', '$totalPrice'] } },
          latest: { $max: '$createdAt' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: MAX_SIGNALS_PER_DETECTOR },
    ])
    .toArray();

  const directory = await phoneDirectory(db, groups.map((g) => g._id));
  return groups.map((group) => {
    const total = (group.amounts as any[]).reduce((sum, value) => {
      const amount = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/[^0-9.\-]/g, ''));
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    const phone = String(group._id || '');
    const subject = phone
      ? directory.subject(phone)
      : { subjectType: 'booking' as const, subjectId: 'no-phone', subjectLabel: 'Bookings with no phone number', href: '/bookings' };
    return {
      key: `unverified_paid:${phone || 'no-phone'}`,
      group: 'payment_risk' as const,
      detector: 'unverified_paid_booking',
      title: 'Booking marked paid but never confirmed with the gateway',
      severity: 'medium' as const,
      ...subject,
      href: phone ? `/bookings?q=${encodeURIComponent(phone)}` : '/bookings',
      evidence:
        `${group.count} confirmed booking${group.count === 1 ? '' : 's'} for ${phone || 'an unknown phone number'} totalling ${rupees(total)} ` +
        `${group.count === 1 ? 'has' : 'have'} payment status "unverified": the payment was never checked with the payment gateway.`,
      detectedAt: now(),
    };
  });
}

async function detectDisputedPayments(db: Db): Promise<RiskSignal[]> {
  const rows = await db
    .collection('transactions')
    .find(
      { type: 'payment', status: 'disputed' },
      { projection: { reference: 1, amount: 1, customerPhone: 1, gatewayPaymentId: 1, payeeName: 1, createdAt: 1, updatedAt: 1 } }
    )
    .sort({ updatedAt: -1 })
    .limit(MAX_SIGNALS_PER_DETECTOR)
    .toArray();

  return rows.map((row) => ({
    key: `disputed_payment:${row.reference || row._id}`,
    group: 'payment_risk' as const,
    detector: 'disputed_payment',
    title: 'Payment marked as disputed',
    severity: 'high' as const,
    subjectType: 'payment' as const,
    subjectId: String(row.reference || row._id),
    subjectLabel: [row.reference, row.customerPhone].filter(Boolean).join(' · '),
    evidence:
      `Payment ${row.reference || row._id} of ${rupees(row.amount || 0)} from ${row.customerPhone || 'an unknown phone number'}` +
      `${row.payeeName ? ` to ${row.payeeName}` : ''} is marked disputed in the ledger (recorded ${fmt(toTime(row.createdAt) || Date.now())}).`,
    detectedAt: now(),
    href: `/finance/ledger?q=${encodeURIComponent(row.reference || '')}`,
  }));
}

/* ------------------------------------------------------------------ */
/* 5. OTP abuse                                                        */
/* ------------------------------------------------------------------ */

async function detectOtpAbuse(db: Db, settings: RiskSettings): Promise<{ signals: RiskSignal[]; recording: boolean; eventsLast24h: number }> {
  const collection = db.collection('otpEvents');
  const recording = (await collection.estimatedDocumentCount()) > 0;
  if (!recording) return { signals: [], recording: false, eventsLast24h: 0 };

  const from = new Date(Date.now() - DAY);
  const events = await collection
    .find(since('createdAt', from), { projection: { phone: 1, type: 1, success: 1, ip: 1, createdAt: 1 } })
    .limit(50000)
    .toArray();

  type Bucket = Map<string, number[]>;
  const buckets: Record<'sendPhone' | 'failPhone' | 'sendIp' | 'failIp', Bucket> = {
    sendPhone: new Map(), failPhone: new Map(), sendIp: new Map(), failIp: new Map(),
  };
  const push = (bucket: Bucket, id: any, time: number) => {
    if (typeof id !== 'string' || !id || id === 'unknown') return;
    if (!bucket.has(id)) bucket.set(id, []);
    bucket.get(id)!.push(time);
  };

  for (const event of events) {
    const time = toTime(event.createdAt);
    if (time === null) continue;
    if (event.type === 'send') {
      push(buckets.sendPhone, event.phone, time);
      push(buckets.sendIp, event.ip, time);
    } else if (event.type === 'verify' && event.success === false) {
      push(buckets.failPhone, event.phone, time);
      push(buckets.failIp, event.ip, time);
    }
  }

  const rules: { bucket: Bucket; detector: string; by: 'phone' | 'ip'; what: string; title: string; threshold: number }[] = [
    { bucket: buckets.sendPhone, detector: 'otp_sends_phone', by: 'phone', what: 'OTP requests were made for', title: 'Many OTP requests for one phone number', threshold: settings.otpSendsPerPhonePerHour },
    { bucket: buckets.failPhone, detector: 'otp_failures_phone', by: 'phone', what: 'wrong OTP codes were entered for', title: 'Many wrong OTP codes for one phone number', threshold: settings.otpFailedVerifiesPerPhonePerHour },
    { bucket: buckets.sendIp, detector: 'otp_sends_ip', by: 'ip', what: 'OTP requests came from IP address', title: 'Many OTP requests from one IP address', threshold: settings.otpSendsPerIpPerHour },
    { bucket: buckets.failIp, detector: 'otp_failures_ip', by: 'ip', what: 'wrong OTP codes came from IP address', title: 'Many wrong OTP codes from one IP address', threshold: settings.otpFailedVerifiesPerIpPerHour },
  ];

  const hits: { rule: (typeof rules)[number]; id: string; peak: ReturnType<typeof peakWindow>; total: number }[] = [];
  for (const rule of rules) {
    for (const [id, times] of Array.from(rule.bucket.entries())) {
      if (times.length < rule.threshold) continue;
      const peak = peakWindow(times, HOUR);
      if (peak.count >= rule.threshold) hits.push({ rule, id, peak, total: times.length });
    }
  }
  hits.sort((a, b) => b.peak.count / b.rule.threshold - a.peak.count / a.rule.threshold);

  const directory = await phoneDirectory(db, hits.filter((h) => h.rule.by === 'phone').map((h) => h.id));
  const signals = hits.slice(0, MAX_SIGNALS_PER_DETECTOR).map((hit) => {
    const subject =
      hit.rule.by === 'phone'
        ? directory.subject(hit.id)
        : { subjectType: 'ip' as const, subjectId: hit.id, subjectLabel: `IP ${hit.id}`, href: null };
    return {
      key: `${hit.rule.detector}:${hit.id}:${new Date(hit.peak.start).toISOString().slice(0, 13)}`,
      group: 'otp_abuse' as const,
      detector: hit.rule.detector,
      title: hit.rule.title,
      severity: hit.peak.count >= hit.rule.threshold * 3 ? ('high' as const) : ('medium' as const),
      ...subject,
      href: hit.rule.by === 'phone' && subject.subjectType === 'phone' ? null : subject.href,
      evidence:
        `${hit.peak.count} ${hit.rule.what} ${hit.id} within one hour starting ${fmt(hit.peak.start)} ` +
        `(threshold: ${hit.rule.threshold} per hour; ${hit.total} in the last 24 hours).`,
      detectedAt: now(),
    };
  });

  return { signals, recording: true, eventsLast24h: events.length };
}

/* ------------------------------------------------------------------ */
/* 6. Refund patterns                                                  */
/* ------------------------------------------------------------------ */

async function detectRepeatedCancellations(db: Db, settings: RiskSettings): Promise<RiskSignal[]> {
  const from = new Date(Date.now() - 30 * DAY);
  const [cancelled, refunds] = await Promise.all([
    db
      .collection('bookings')
      .aggregate([
        { $match: { status: 'cancelled', userPhone: { $type: 'string', $ne: '' } } },
        { $project: { userPhone: 1, at: { $ifNull: ['$cancelledAt', { $ifNull: ['$updatedAt', '$createdAt'] }] } } },
        { $match: since('at', from) },
        { $group: { _id: '$userPhone', count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection('refunds')
      .aggregate([
        { $match: { customerPhone: { $type: 'string', $ne: '' }, createdAt: { $gte: from } } },
        { $group: { _id: '$customerPhone', count: { $sum: 1 }, amount: { $sum: '$refundAmount' } } },
      ])
      .toArray(),
  ]);

  const byPhone = new Map<string, { cancellations: number; refundRequests: number; refundAmount: number }>();
  const entry = (phone: string) => {
    if (!byPhone.has(phone)) byPhone.set(phone, { cancellations: 0, refundRequests: 0, refundAmount: 0 });
    return byPhone.get(phone)!;
  };
  for (const row of cancelled) entry(row._id).cancellations = row.count;
  for (const row of refunds) {
    entry(row._id).refundRequests = row.count;
    entry(row._id).refundAmount = typeof row.amount === 'number' ? row.amount : 0;
  }

  const hits = Array.from(byPhone.entries())
    .filter(([, v]) => v.cancellations >= settings.cancellationsIn30Days || v.refundRequests >= settings.cancellationsIn30Days)
    .sort((a, b) => Math.max(b[1].cancellations, b[1].refundRequests) - Math.max(a[1].cancellations, a[1].refundRequests))
    .slice(0, MAX_SIGNALS_PER_DETECTOR);

  const directory = await phoneDirectory(db, hits.map(([phone]) => phone));
  return hits.map(([phone, v]) => ({
    key: `repeated_cancellations:${phone}`,
    group: 'refund_patterns' as const,
    detector: 'repeated_cancellations',
    title: 'Repeated cancellations or refund requests',
    severity: Math.max(v.cancellations, v.refundRequests) >= settings.cancellationsIn30Days * 2 ? ('high' as const) : ('medium' as const),
    ...directory.subject(phone),
    evidence:
      `${phone} has ${v.cancellations} cancelled booking${v.cancellations === 1 ? '' : 's'} and ${v.refundRequests} refund request${v.refundRequests === 1 ? '' : 's'}` +
      `${v.refundRequests ? ` (${rupees(v.refundAmount)})` : ''} in the last 30 days (threshold: ${settings.cancellationsIn30Days} of either).`,
    detectedAt: now(),
  }));
}

async function detectHighRefundShare(db: Db, settings: RiskSettings): Promise<RiskSignal[]> {
  const rows = await db
    .collection('transactions')
    .aggregate([
      {
        $match: {
          payeeId: { $type: 'string', $ne: '' },
          $or: [
            { type: 'payment', status: { $in: ['success', 'refunded'] } },
            { type: 'refund', status: 'success' },
          ],
        },
      },
      {
        $group: {
          _id: { payeeType: '$payeeType', payeeId: '$payeeId' },
          payeeName: { $max: '$payeeName' },
          payments: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, 1, 0] } },
          paid: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
          refunds: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, 1, 0] } },
          refunded: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, '$amount', 0] } },
        },
      },
      { $match: { payments: { $gte: settings.refundShareMinPayments }, refunds: { $gt: 0 } } },
    ])
    .toArray();

  return rows
    .map((row) => ({ row, share: (row.refunds / row.payments) * 100 }))
    .filter(({ share }) => share >= settings.refundSharePercent)
    .sort((a, b) => b.share - a.share)
    .slice(0, MAX_SIGNALS_PER_DETECTOR)
    .map(({ row, share }) => {
      const payeeType = String(row._id.payeeType || 'payee');
      const payeeId = String(row._id.payeeId);
      const subjectType: SubjectType = payeeType === 'artist' || payeeType === 'organizer' ? payeeType : 'payee';
      return {
        key: `refund_share:${payeeType}:${payeeId}`,
        group: 'refund_patterns' as const,
        detector: 'high_refund_share',
        title: 'Payee with a high share of refunded payments',
        severity: share >= Math.min(100, settings.refundSharePercent * 2) ? ('high' as const) : ('medium' as const),
        subjectType,
        subjectId: payeeId,
        subjectLabel: row.payeeName || `${payeeType} ${payeeId}`,
        evidence:
          `${row.refunds} of ${row.payments} payments to ${row.payeeName || payeeId} were refunded (${share.toFixed(1)}%; ` +
          `${rupees(row.refunded || 0)} of ${rupees(row.paid || 0)}). Threshold: ${settings.refundSharePercent}%, judged only from ${settings.refundShareMinPayments} payments.`,
        detectedAt: now(),
        href: toObjectId(payeeId) ? accountHref(subjectType, payeeId) : null,
      };
    });
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

export interface RiskGroupResult {
  key: SignalGroupKey;
  label: string;
  description: string;
  signals: RiskSignal[];
  counts: Record<SignalSeverity, number>;
  /** Stated on the panel when a detector cannot work yet, or failed to run. */
  notes: string[];
}

export interface RiskRun {
  ranAt: string;
  durationMs: number;
  settings: RiskSettings;
  groups: RiskGroupResult[];
  totals: { signals: number; high: number; medium: number; low: number; withOpenCase: number };
  otp: { recording: boolean; eventsLast24h: number };
}

export const OPEN_CASE_STATUSES = ['open', 'under_review', 'escalated'];

const SEVERITY_ORDER: Record<SignalSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Runs every detector. A detector that fails is reported on its panel and does not stop the others. */
export async function runRiskChecks(db: Db): Promise<RiskRun> {
  const started = Date.now();
  const { settings } = await getRiskSettings(db);

  const notes: Record<SignalGroupKey, string[]> = {
    multiple_accounts: [], account_activity: [], seller_risk: [], payment_risk: [], otp_abuse: [], refund_patterns: [],
  };
  const otp = { recording: false, eventsLast24h: 0 };

  const guarded = async (group: SignalGroupKey, name: string, run: () => Promise<RiskSignal[]>): Promise<RiskSignal[]> => {
    try {
      const signals = await run();
      if (signals.length >= MAX_SIGNALS_PER_DETECTOR) {
        notes[group].push(`"${name}" returned its limit of ${MAX_SIGNALS_PER_DETECTOR} signals; there may be more.`);
      }
      return signals;
    } catch (error) {
      console.error(`Risk check "${name}" failed:`, error);
      notes[group].push(`The check "${name}" could not be run. Its results are missing from this list.`);
      return [];
    }
  };

  const results = await Promise.all([
    guarded('multiple_accounts', 'Shared email address', () => detectDuplicateEmails(db)),
    guarded('multiple_accounts', 'Shared Aadhaar or PAN number', () => detectSharedIdentityNumbers(db)),
    guarded('account_activity', 'Booking bursts', () => detectBookingBursts(db, settings)),
    guarded('account_activity', 'Bookings from restricted accounts', () => detectRestrictedAccountBookings(db, settings)),
    guarded('seller_risk', 'Approved without KYC documents', () => detectApprovedWithoutKyc(db)),
    guarded('seller_risk', 'Open reports', () => detectReportedSellers(db)),
    guarded('seller_risk', 'Approval reversals', () => detectApprovalReversals(db, settings)),
    guarded('payment_risk', 'Failed payments', () => detectFailedPayments(db, settings)),
    guarded('payment_risk', 'Unverified paid bookings', () => detectUnverifiedPaidBookings(db)),
    guarded('payment_risk', 'Disputed payments', () => detectDisputedPayments(db)),
    guarded('otp_abuse', 'OTP requests', async () => {
      const outcome = await detectOtpAbuse(db, settings);
      otp.recording = outcome.recording;
      otp.eventsLast24h = outcome.eventsLast24h;
      return outcome.signals;
    }),
    guarded('refund_patterns', 'Repeated cancellations', () => detectRepeatedCancellations(db, settings)),
    guarded('refund_patterns', 'Refund share by payee', () => detectHighRefundShare(db, settings)),
  ]);

  if (!otp.recording && notes.otp_abuse.length === 0) {
    notes.otp_abuse.push(
      'OTP events are not being recorded yet, so this check has nothing to read. It will start working when the sign-in routes write to the otpEvents collection.'
    );
  }

  const all = results.flat();

  // Mark signals that already have a case being worked on.
  let withOpenCase = 0;
  if (all.length) {
    try {
      const cases = await db
        .collection('riskCases')
        .find({ signalKey: { $in: all.map((s) => s.key) }, status: { $in: OPEN_CASE_STATUSES } }, { projection: { signalKey: 1, status: 1 } })
        .toArray();
      const byKey = new Map(cases.map((c) => [c.signalKey, { id: String(c._id), status: String(c.status) }]));
      for (const signal of all) {
        signal.openCase = byKey.get(signal.key) || null;
        if (signal.openCase) withOpenCase++;
      }
    } catch (error) {
      console.error('Could not match signals to risk cases:', error);
    }
  }

  const groups: RiskGroupResult[] = SIGNAL_GROUPS.map((group) => {
    const signals = all
      .filter((s) => s.group === group.key)
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return {
      ...group,
      signals,
      counts: {
        high: signals.filter((s) => s.severity === 'high').length,
        medium: signals.filter((s) => s.severity === 'medium').length,
        low: signals.filter((s) => s.severity === 'low').length,
      },
      notes: notes[group.key],
    };
  });

  return {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    settings,
    groups,
    totals: {
      signals: all.length,
      high: all.filter((s) => s.severity === 'high').length,
      medium: all.filter((s) => s.severity === 'medium').length,
      low: all.filter((s) => s.severity === 'low').length,
      withOpenCase,
    },
    otp,
  };
}
