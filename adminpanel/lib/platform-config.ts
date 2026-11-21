import crypto from 'crypto';
import type { Db } from 'mongodb';

/**
 * Platform configuration (requirements section 15), stored in the `settings`
 * document { type: 'platform' }. Server only.
 *
 * GET /api/public/platform exposes the public part of it. The mobile apps and
 * the website do not call that endpoint yet, so maintenance mode is recorded
 * and published there but does not block them today.
 */

export const PLATFORM_SETTINGS_TYPE = 'platform';

export interface MaintenanceWindow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  message: string;
  /** Publish the window to the apps before it starts. */
  notifyInAdvance: boolean;
}

export interface PlatformConfig {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  contactAddress: string;
  defaultCurrency: string;
  timezone: string;
  legalLinks: { terms: string; privacy: string; refund: string; cancellation: string };
  maintenance: { enabled: boolean; message: string; allowAdmins: boolean };
  maintenanceWindows: MaintenanceWindow[];
  updatedAt: Date | null;
  updatedBy: string | null;
}

export const CURRENCIES = ['INR'];
export const LEGAL_LINK_KEYS = ['terms', 'privacy', 'refund', 'cancellation'] as const;

const DEFAULTS: PlatformConfig = {
  platformName: 'Mookalaa',
  supportEmail: '',
  supportPhone: '',
  contactAddress: '',
  defaultCurrency: 'INR',
  timezone: 'Asia/Kolkata',
  legalLinks: { terms: '', privacy: '', refund: '', cancellation: '' },
  maintenance: { enabled: false, message: '', allowAdmins: true },
  maintenanceWindows: [],
  updatedAt: null,
  updatedBy: null,
};

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
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
    }))
    .filter((w) => !Number.isNaN(w.startsAt.getTime()) && !Number.isNaN(w.endsAt.getTime()));
}

export async function getPlatformConfig(db: Db): Promise<PlatformConfig> {
  const doc = await db.collection('settings').findOne({ type: PLATFORM_SETTINGS_TYPE });
  if (!doc) return { ...DEFAULTS, legalLinks: { ...DEFAULTS.legalLinks }, maintenance: { ...DEFAULTS.maintenance } };
  return {
    platformName: str(doc.platformName, 80) || DEFAULTS.platformName,
    supportEmail: str(doc.supportEmail, 200),
    supportPhone: str(doc.supportPhone, 20),
    contactAddress: str(doc.contactAddress, 500),
    defaultCurrency: str(doc.defaultCurrency, 3) || DEFAULTS.defaultCurrency,
    timezone: str(doc.timezone, 60) || DEFAULTS.timezone,
    legalLinks: {
      terms: str(doc.legalLinks?.terms, 500),
      privacy: str(doc.legalLinks?.privacy, 500),
      refund: str(doc.legalLinks?.refund, 500),
      cancellation: str(doc.legalLinks?.cancellation, 500),
    },
    maintenance: {
      enabled: doc.maintenance?.enabled === true,
      message: str(doc.maintenance?.message, 500),
      allowAdmins: doc.maintenance?.allowAdmins !== false,
    },
    maintenanceWindows: readWindows(doc.maintenanceWindows).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy || null,
  };
}

/** Validates a submitted configuration. Returns the clean value or the first problem. */
export function validatePlatformConfig(input: any): { ok: true; value: Omit<PlatformConfig, 'updatedAt' | 'updatedBy'> } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid request body' };

  const platformName = str(input.platformName, 80);
  if (!platformName) return { ok: false, error: 'Platform name is required' };

  const supportEmail = str(input.supportEmail, 200).toLowerCase();
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) return { ok: false, error: 'Support email is not a valid email address' };

  const supportPhone = str(input.supportPhone, 20).replace(/[\s\-()]/g, '');
  if (supportPhone && !/^\+?\d{7,15}$/.test(supportPhone)) return { ok: false, error: 'Support phone is not a valid phone number' };

  const defaultCurrency = str(input.defaultCurrency, 3).toUpperCase();
  if (!CURRENCIES.includes(defaultCurrency)) return { ok: false, error: 'Only INR is supported: payments are taken in Indian rupees' };

  const timezone = str(input.timezone, 60);
  if (!timezone || !validTimezone(timezone)) return { ok: false, error: 'Timezone is not a valid IANA timezone, for example Asia/Kolkata' };

  const legalLinks = { terms: '', privacy: '', refund: '', cancellation: '' };
  for (const key of LEGAL_LINK_KEYS) {
    const link = str(input.legalLinks?.[key], 500);
    if (link && !/^https?:\/\/\S+$/i.test(link)) return { ok: false, error: `The ${key} link must start with http:// or https://` };
    legalLinks[key] = link;
  }

  const maintenance = {
    enabled: input.maintenance?.enabled === true,
    message: str(input.maintenance?.message, 500),
    allowAdmins: input.maintenance?.allowAdmins !== false,
  };
  if (maintenance.enabled && !maintenance.message) {
    return { ok: false, error: 'Write the maintenance message people will see before switching maintenance mode on' };
  }

  const rawWindows = Array.isArray(input.maintenanceWindows) ? input.maintenanceWindows : [];
  if (rawWindows.length > 20) return { ok: false, error: 'No more than 20 maintenance windows can be scheduled' };
  const maintenanceWindows: MaintenanceWindow[] = [];
  for (const [index, raw] of rawWindows.entries()) {
    const startsAt = new Date(raw?.startsAt);
    const endsAt = new Date(raw?.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { ok: false, error: `Maintenance window ${index + 1}: start and end are required` };
    }
    if (endsAt.getTime() <= startsAt.getTime()) return { ok: false, error: `Maintenance window ${index + 1}: the end must be after the start` };
    const message = str(raw?.message, 500);
    if (!message) return { ok: false, error: `Maintenance window ${index + 1}: a message is required` };
    maintenanceWindows.push({
      id: /^[a-f0-9]{12}$/.test(str(raw?.id, 40)) ? str(raw.id, 40) : crypto.randomBytes(6).toString('hex'),
      startsAt,
      endsAt,
      message,
      notifyInAdvance: raw?.notifyInAdvance === true,
    });
  }
  maintenanceWindows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return {
    ok: true,
    value: { platformName, supportEmail, supportPhone, contactAddress: str(input.contactAddress, 500), defaultCurrency, timezone, legalLinks, maintenance, maintenanceWindows },
  };
}

export async function savePlatformConfig(db: Db, value: Omit<PlatformConfig, 'updatedAt' | 'updatedBy'>, updatedBy: string | null) {
  const now = new Date();
  await db
    .collection('settings')
    .updateOne(
      { type: PLATFORM_SETTINGS_TYPE },
      { $set: { ...value, updatedAt: now, updatedBy }, $setOnInsert: { type: PLATFORM_SETTINGS_TYPE, createdAt: now } },
      { upsert: true }
    );
  return getPlatformConfig(db);
}

/** The values compared and stored in the audit log (dates as ISO text so they compare cleanly). */
export function auditShape(config: PlatformConfig | Omit<PlatformConfig, 'updatedAt' | 'updatedBy'>) {
  return {
    platformName: config.platformName,
    supportEmail: config.supportEmail,
    supportPhone: config.supportPhone,
    contactAddress: config.contactAddress,
    defaultCurrency: config.defaultCurrency,
    timezone: config.timezone,
    legalLinks: config.legalLinks,
    maintenance: config.maintenance,
    maintenanceWindows: config.maintenanceWindows.map((w) => ({
      id: w.id,
      startsAt: w.startsAt.toISOString(),
      endsAt: w.endsAt.toISOString(),
      message: w.message,
      notifyInAdvance: w.notifyInAdvance,
    })),
  };
}

/** Maintenance as the apps and website should see it at a point in time. */
export function maintenanceStatus(config: PlatformConfig, now = new Date()) {
  const current = config.maintenanceWindows.find((w) => w.startsAt <= now && w.endsAt > now) || null;
  const upcoming = config.maintenanceWindows.find((w) => w.startsAt > now && w.notifyInAdvance) || null;
  const active = config.maintenance.enabled || Boolean(current);
  return {
    active,
    message: active ? (config.maintenance.enabled ? config.maintenance.message : current!.message) : '',
    endsAt: !config.maintenance.enabled && current ? current.endsAt : null,
    upcomingWindow: upcoming ? { startsAt: upcoming.startsAt, endsAt: upcoming.endsAt, message: upcoming.message } : null,
  };
}

/** Only what the apps and website may know. No admin names, no internal settings. */
export function publicPlatformInfo(config: PlatformConfig, now = new Date()) {
  return {
    name: config.platformName,
    support: { email: config.supportEmail, phone: config.supportPhone, address: config.contactAddress },
    currency: config.defaultCurrency,
    timezone: config.timezone,
    policyLinks: config.legalLinks,
    maintenance: maintenanceStatus(config, now),
  };
}
