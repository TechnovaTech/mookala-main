import crypto from 'crypto';
import type { Db } from 'mongodb';

/**
 * Platform configuration (requirements section 15), stored in the `settings`
 * document { type: 'platform' }. Server only.
 *
 * Read by:
 *   GET /api/public/platform   the website and both apps: name, contacts,
 *                              policy links and the maintenance state
 *   lib/maintenance.ts         refuses the public write routes while
 *                              maintenance is active, and keeps the advance
 *                              notice announcements in step with the windows
 *   GET /api/admin/platform    the Platform Configuration screen
 *
 * Maintenance is active while the switch is on, or automatically between a
 * window's start and end. It is worked out on every read, so no scheduler is
 * involved in starting or ending a window.
 *
 * Currency and timezone are fixed. Razorpay orders are created in INR, and the
 * reports, statements, dashboard, booking cut-offs and membership dates all
 * count whole days in India time with a fixed +05:30 offset. A setting that
 * let an admin pick another value would change none of that, so they are
 * stored and published as constants.
 */

export const PLATFORM_SETTINGS_TYPE = 'platform';
export const PLATFORM_CURRENCY = 'INR';
export const PLATFORM_TIMEZONE = 'Asia/Kolkata';

/** The website page that shows each policy. The refund page also lists the cancellation rules. */
export const POLICY_PAGES = {
  terms: '/terms',
  privacy: '/privacy',
  refund: '/refund-policy',
  cancellation: '/refund-policy',
} as const;
export type PolicyLinkKey = keyof typeof POLICY_PAGES;
export const POLICY_LINK_KEYS = Object.keys(POLICY_PAGES) as PolicyLinkKey[];

export const NOTICE_CHANNELS = ['sms', 'email', 'whatsapp', 'push'] as const;
export const DEFAULT_NOTICE_HOURS = 24;
export const MAX_NOTICE_HOURS = 14 * 24;
export const DEFAULT_NOTICE_TEMPLATE = 'maintenance_notice';

export interface MaintenanceWindow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  message: string;
  /** Create an announcement to customers, artists and organisers before the window starts. */
  notifyInAdvance: boolean;
  /** How many hours before the start the announcement is scheduled. */
  notifyHoursBefore: number;
}

export interface PlatformConfig {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  contactAddress: string;
  /** General enquiries, shown on the website next to the partnerships address. */
  generalEmail: string;
  partnershipsEmail: string;
  /** Public website address, without a trailing slash. Policy links are built from it. */
  websiteUrl: string;
  defaultCurrency: string;
  timezone: string;
  maintenance: { enabled: boolean; message: string };
  maintenanceWindows: MaintenanceWindow[];
  /** How the advance notice announcements are sent. */
  advanceNotice: { channels: string[]; templateKey: string };
  updatedAt: Date | null;
  updatedBy: string | null;
}

export type PlatformConfigInput = Omit<PlatformConfig, 'updatedAt' | 'updatedBy'>;

const DEFAULTS: PlatformConfigInput = {
  platformName: 'Mookalaa',
  supportEmail: '',
  supportPhone: '',
  contactAddress: '',
  generalEmail: '',
  partnershipsEmail: '',
  websiteUrl: '',
  defaultCurrency: PLATFORM_CURRENCY,
  timezone: PLATFORM_TIMEZONE,
  maintenance: { enabled: false, message: '' },
  maintenanceWindows: [],
  advanceNotice: { channels: ['sms', 'email'], templateKey: DEFAULT_NOTICE_TEMPLATE },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMPLATE_KEY = /^[a-z0-9_]{2,50}$/;

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function hours(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n >= 1 && n <= MAX_NOTICE_HOURS ? Math.round(n) : DEFAULT_NOTICE_HOURS;
}

function channelList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return NOTICE_CHANNELS.filter((c) => value.includes(c));
}

function readWindows(value: any): MaintenanceWindow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((w) => ({
      id: str(w?.id, 40) || crypto.randomBytes(6).toString('hex'),
      startsAt: new Date(w?.startsAt),
      endsAt: new Date(w?.endsAt),
      message: str(w?.message, 500),
      notifyInAdvance: w?.notifyInAdvance === true,
      notifyHoursBefore: hours(w?.notifyHoursBefore),
    }))
    .filter((w) => !Number.isNaN(w.startsAt.getTime()) && !Number.isNaN(w.endsAt.getTime()));
}

export async function getPlatformConfig(db: Db): Promise<PlatformConfig> {
  const doc = await db.collection('settings').findOne({ type: PLATFORM_SETTINGS_TYPE });
  if (!doc) {
    return {
      ...DEFAULTS,
      maintenance: { ...DEFAULTS.maintenance },
      maintenanceWindows: [],
      advanceNotice: { ...DEFAULTS.advanceNotice, channels: [...DEFAULTS.advanceNotice.channels] },
      updatedAt: null,
      updatedBy: null,
    };
  }
  const channels = channelList(doc.advanceNotice?.channels);
  return {
    platformName: str(doc.platformName, 80) || DEFAULTS.platformName,
    supportEmail: str(doc.supportEmail, 200),
    supportPhone: str(doc.supportPhone, 20),
    contactAddress: str(doc.contactAddress, 500),
    generalEmail: str(doc.generalEmail, 200),
    partnershipsEmail: str(doc.partnershipsEmail, 200),
    websiteUrl: str(doc.websiteUrl, 200),
    defaultCurrency: PLATFORM_CURRENCY,
    timezone: PLATFORM_TIMEZONE,
    maintenance: {
      enabled: doc.maintenance?.enabled === true,
      message: str(doc.maintenance?.message, 500),
    },
    maintenanceWindows: readWindows(doc.maintenanceWindows).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    advanceNotice: {
      channels: Array.isArray(doc.advanceNotice?.channels) ? channels : [...DEFAULTS.advanceNotice.channels],
      templateKey: TEMPLATE_KEY.test(str(doc.advanceNotice?.templateKey, 50)) ? str(doc.advanceNotice.templateKey, 50) : DEFAULT_NOTICE_TEMPLATE,
    },
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy || null,
  };
}

/** Validates a submitted configuration. Returns the clean value or the first problem. */
export function validatePlatformConfig(input: any): { ok: true; value: PlatformConfigInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid request body' };

  const platformName = str(input.platformName, 80);
  if (!platformName) return { ok: false, error: 'Platform name is required' };

  const emails: Record<'supportEmail' | 'generalEmail' | 'partnershipsEmail', string> = { supportEmail: '', generalEmail: '', partnershipsEmail: '' };
  const emailLabels = { supportEmail: 'Support email', generalEmail: 'General enquiries email', partnershipsEmail: 'Partnerships email' };
  for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
    const value = str(input[key], 200).toLowerCase();
    if (value && !EMAIL.test(value)) return { ok: false, error: `${emailLabels[key]} is not a valid email address` };
    emails[key] = value;
  }

  const supportPhone = str(input.supportPhone, 20).replace(/[\s\-()]/g, '');
  if (supportPhone && !/^\+?\d{7,15}$/.test(supportPhone)) return { ok: false, error: 'Support phone is not a valid phone number' };

  const websiteUrl = str(input.websiteUrl, 200).replace(/\/+$/, '');
  if (websiteUrl && !/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(websiteUrl)) {
    return { ok: false, error: 'Website address must start with http:// or https:// and contain no spaces, ? or #, for example https://www.mookalaa.com' };
  }

  // Sent by older forms; anything other than the fixed values is refused rather than ignored.
  const currency = str(input.defaultCurrency, 3).toUpperCase();
  if (currency && currency !== PLATFORM_CURRENCY) {
    return { ok: false, error: 'The currency is fixed to INR: Razorpay orders, the ledger and every amount on the platform are in Indian rupees' };
  }
  const timezone = str(input.timezone, 60);
  if (timezone && timezone !== PLATFORM_TIMEZONE) {
    return { ok: false, error: 'The timezone is fixed to Asia/Kolkata: reports, statements and booking cut-offs count days in India time' };
  }

  const maintenance = {
    enabled: input.maintenance?.enabled === true,
    message: str(input.maintenance?.message, 500),
  };
  if (maintenance.enabled && !maintenance.message) {
    return { ok: false, error: 'Write the maintenance message people will see before switching maintenance mode on' };
  }

  const rawWindows = Array.isArray(input.maintenanceWindows) ? input.maintenanceWindows : [];
  if (rawWindows.length > 20) return { ok: false, error: 'No more than 20 maintenance windows can be scheduled' };
  const maintenanceWindows: MaintenanceWindow[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of rawWindows.entries()) {
    const label = `Maintenance window ${index + 1}`;
    const startsAt = new Date(raw?.startsAt);
    const endsAt = new Date(raw?.endsAt);
    if (!raw?.startsAt || !raw?.endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { ok: false, error: `${label}: start and end are required` };
    }
    if (endsAt.getTime() <= startsAt.getTime()) return { ok: false, error: `${label}: the end must be after the start` };
    if (endsAt.getTime() - startsAt.getTime() > 7 * 24 * 3600 * 1000) return { ok: false, error: `${label}: a window can last at most 7 days` };
    const message = str(raw?.message, 500);
    if (!message) return { ok: false, error: `${label}: a message is required` };
    const notifyInAdvance = raw?.notifyInAdvance === true;
    let notifyHoursBefore = DEFAULT_NOTICE_HOURS;
    if (raw?.notifyHoursBefore !== undefined && raw?.notifyHoursBefore !== null && raw?.notifyHoursBefore !== '') {
      const n = Number(raw.notifyHoursBefore);
      if (!Number.isInteger(n) || n < 1 || n > MAX_NOTICE_HOURS) {
        return { ok: false, error: `${label}: the notice must be a whole number of hours from 1 to ${MAX_NOTICE_HOURS}` };
      }
      notifyHoursBefore = n;
    }
    const givenId = str(raw?.id, 40);
    const id = /^[a-f0-9]{12}$/.test(givenId) && !seen.has(givenId) ? givenId : crypto.randomBytes(6).toString('hex');
    seen.add(id);
    maintenanceWindows.push({ id, startsAt, endsAt, message, notifyInAdvance, notifyHoursBefore });
  }
  maintenanceWindows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const rawChannels = Array.isArray(input.advanceNotice?.channels) ? input.advanceNotice.channels : DEFAULTS.advanceNotice.channels;
  if (rawChannels.some((c: unknown) => !(NOTICE_CHANNELS as readonly string[]).includes(String(c)))) {
    return { ok: false, error: 'Advance notice: unknown channel' };
  }
  const channels = channelList(rawChannels);
  const templateKey = str(input.advanceNotice?.templateKey, 50).toLowerCase() || DEFAULT_NOTICE_TEMPLATE;
  if (!TEMPLATE_KEY.test(templateKey)) {
    return { ok: false, error: 'Advance notice: the template key must be 2 to 50 lower-case letters, numbers or underscores' };
  }
  if (channels.length === 0 && maintenanceWindows.some((w) => w.notifyInAdvance)) {
    return { ok: false, error: 'Advance notice: choose at least one channel for the announcements' };
  }

  return {
    ok: true,
    value: {
      platformName,
      ...emails,
      supportPhone,
      contactAddress: str(input.contactAddress, 500),
      websiteUrl,
      defaultCurrency: PLATFORM_CURRENCY,
      timezone: PLATFORM_TIMEZONE,
      maintenance,
      maintenanceWindows,
      advanceNotice: { channels, templateKey },
    },
  };
}

export async function savePlatformConfig(db: Db, value: PlatformConfigInput, updatedBy: string | null) {
  const now = new Date();
  await db.collection('settings').updateOne(
    { type: PLATFORM_SETTINGS_TYPE },
    {
      $set: { ...value, updatedAt: now, updatedBy },
      // Free-text links of the earlier version of this screen: the links are now built from websiteUrl.
      // (The old maintenance.allowAdmins flag goes with the $set of `maintenance` above.)
      $unset: { legalLinks: '' },
      $setOnInsert: { type: PLATFORM_SETTINGS_TYPE, createdAt: now },
    },
    { upsert: true }
  );
  return getPlatformConfig(db);
}

/** The values compared and stored in the audit log (dates as ISO text so they compare cleanly). */
export function auditShape(config: PlatformConfigInput) {
  return {
    platformName: config.platformName,
    supportEmail: config.supportEmail,
    supportPhone: config.supportPhone,
    contactAddress: config.contactAddress,
    generalEmail: config.generalEmail,
    partnershipsEmail: config.partnershipsEmail,
    websiteUrl: config.websiteUrl,
    defaultCurrency: config.defaultCurrency,
    timezone: config.timezone,
    maintenance: config.maintenance,
    maintenanceWindows: config.maintenanceWindows.map((w) => ({
      id: w.id,
      startsAt: w.startsAt.toISOString(),
      endsAt: w.endsAt.toISOString(),
      message: w.message,
      notifyInAdvance: w.notifyInAdvance,
      notifyHoursBefore: w.notifyHoursBefore,
    })),
    advanceNotice: config.advanceNotice,
  };
}

/** The website page for each policy, or '' while no website address is set. */
export function policyLinks(config: Pick<PlatformConfig, 'websiteUrl'>): Record<PolicyLinkKey, string> {
  const base = config.websiteUrl;
  return Object.fromEntries(POLICY_LINK_KEYS.map((key) => [key, base ? base + POLICY_PAGES[key] : ''])) as Record<PolicyLinkKey, string>;
}

function windowView(w: MaintenanceWindow) {
  return { id: w.id, startsAt: w.startsAt, endsAt: w.endsAt, message: w.message, notifyInAdvance: w.notifyInAdvance, notifyHoursBefore: w.notifyHoursBefore };
}

/**
 * Maintenance at a point in time. Active while the switch is on, or while a
 * window covers `now`. `endsAt` is known only when a window (not the switch)
 * makes it active; overlapping windows run to the latest end.
 */
export function maintenanceStatus(config: Pick<PlatformConfig, 'maintenance' | 'maintenanceWindows' | 'platformName'>, now = new Date()) {
  const current = config.maintenanceWindows.filter((w) => w.startsAt <= now && w.endsAt > now);
  const byWindow = current.length > 0;
  const active = config.maintenance.enabled || byWindow;
  const source: 'switch' | 'window' | null = config.maintenance.enabled ? 'switch' : byWindow ? 'window' : null;
  const fallback = `${config.platformName || 'Mookalaa'} is under maintenance. Please try again a little later.`;
  const message = !active ? '' : config.maintenance.enabled ? config.maintenance.message || fallback : current[0].message || fallback;
  const endsAt = source === 'window' ? new Date(Math.max(...current.map((w) => w.endsAt.getTime()))) : null;
  const upcoming = config.maintenanceWindows.find((w) => w.startsAt > now && w.notifyInAdvance) || null;
  const next = config.maintenanceWindows.find((w) => w.startsAt > now) || null;
  return {
    active,
    source,
    message,
    endsAt,
    currentWindow: byWindow ? windowView(current[0]) : null,
    /** The next window announced in advance: published to the apps and website. */
    upcomingWindow: upcoming ? { startsAt: upcoming.startsAt, endsAt: upcoming.endsAt, message: upcoming.message } : null,
    /** The next window of any kind: shown to admins only. */
    nextWindow: next ? windowView(next) : null,
  };
}

/** Only what the apps and website may know. No admin names, no internal settings. */
export function publicPlatformInfo(config: PlatformConfig, now = new Date()) {
  const status = maintenanceStatus(config, now);
  return {
    name: config.platformName,
    support: { email: config.supportEmail, phone: config.supportPhone, address: config.contactAddress },
    contacts: { general: config.generalEmail, partnerships: config.partnershipsEmail },
    website: config.websiteUrl,
    currency: PLATFORM_CURRENCY,
    timezone: PLATFORM_TIMEZONE,
    policyLinks: policyLinks(config),
    maintenance: { active: status.active, message: status.message, endsAt: status.endsAt, upcomingWindow: status.upcomingWindow },
  };
}

/** "10 Jan 2027, 12:00 am" in India time. */
export function formatIst(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: PLATFORM_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
