import type { Db } from 'mongodb';
import { ROLES, normaliseRole, type Role } from './permissions';
import { sendNotification } from './notifications';

/**
 * Security settings and security events. Server only.
 *
 * The settings are one document in `settings` with type 'security'. Every
 * value has a default in this file, so the panel works before anyone has
 * opened the Security Settings screen, and a missing or damaged value falls
 * back to its default instead of switching a protection off.
 *
 * Break-glass: setting the environment variable
 * SECURITY_IP_ALLOWLIST_DISABLED=true switches the IP rule off whatever the
 * stored settings say, so a wrong allow-list can never lock every admin out.
 */

export const SECURITY_SETTINGS_TYPE = 'security';
export const SECURITY_EVENTS = 'securityEvents';

/* ------------------------------------------------------------------ */
/* Sensitive actions that can be made to need a second approver        */
/* ------------------------------------------------------------------ */

export interface SensitiveAction {
  key: string;
  label: string;
  description: string;
  /** Permission module the action belongs to. */
  module: string;
  /** Permission an admin must hold to approve it. Ignored when `superOnly`. */
  permission: string;
  /** Only a (different) Super Admin can approve it. */
  superOnly: boolean;
  defaultOn: boolean;
}

export const SENSITIVE_ACTIONS: SensitiveAction[] = [
  {
    key: 'commission_rules',
    label: 'Commission rules',
    description: 'Creating, editing, deleting, activating or retiring a commission rule.',
    module: 'finance',
    permission: 'finance:manage',
    superOnly: false,
    defaultOn: false,
  },
  {
    key: 'refund_rules',
    label: 'Refund rules',
    description: 'Creating, editing, deleting or changing the status of a refund rule.',
    module: 'refunds',
    permission: 'refunds:manage',
    superOnly: false,
    defaultOn: false,
  },
  {
    key: 'finance_settings',
    label: 'Finance settings',
    description: 'Approval thresholds, payout schedule, settlement eligibility and the GST number.',
    module: 'finance',
    permission: 'finance:manage',
    superOnly: false,
    defaultOn: false,
  },
  {
    key: 'platform_config',
    label: 'Platform configuration and maintenance mode',
    description: 'Any change to the platform configuration, including switching maintenance mode on or off.',
    module: 'platform',
    permission: 'platform:manage',
    superOnly: false,
    defaultOn: false,
  },
  {
    key: 'notification_keys',
    label: 'Notification channels and provider keys',
    description: 'Saving an SMS, email, WhatsApp or push channel, including its provider key.',
    module: 'communications',
    permission: 'integrations:manage',
    superOnly: false,
    defaultOn: false,
  },
  {
    key: 'admin_create',
    label: 'Creating an admin',
    description: 'Adding a new admin account.',
    module: 'security',
    permission: 'security:manage',
    superOnly: true,
    defaultOn: false,
  },
  {
    key: 'admin_role_change',
    label: 'Admin role or permission change',
    description: "Changing an admin's role or their extra permissions.",
    module: 'security',
    permission: 'security:manage',
    superOnly: true,
    defaultOn: true,
  },
  {
    key: 'admin_disable',
    label: 'Disabling an admin',
    description: 'Disabling an admin account.',
    module: 'security',
    permission: 'security:manage',
    superOnly: true,
    defaultOn: false,
  },
  {
    key: 'security_settings',
    label: 'Security settings',
    description: 'Session rules, required 2FA, the IP allow-list and this list of actions.',
    module: 'security',
    permission: 'security:manage',
    superOnly: true,
    defaultOn: true,
  },
];

export function sensitiveAction(key: string): SensitiveAction | undefined {
  return SENSITIVE_ACTIONS.find((action) => action.key === key);
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface SecuritySettings {
  /** How long a new sign-in lasts (token, cookie and session record). */
  sessionHours: number;
  /** A session with no request for this long is ended. */
  idleTimeoutMinutes: number;
  /** Active sessions one admin may hold. The least recently used is ended at sign-in. */
  maxSessions: number;
  /** Admins of these roles must have 2FA on before they can use the panel. */
  twoFactorRequiredRoles: Role[];
  ipAllowlistEnabled: boolean;
  /** IPv4 addresses and CIDR ranges, e.g. "203.0.113.7" or "203.0.113.0/24". */
  ipAllowlist: string[];
  /** The roles the allow-list applies to. */
  ipAllowlistRoles: Role[];
  /** Sensitive action key -> needs a second approver. */
  approvalActions: Record<string, boolean>;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export const SECURITY_LIMITS = {
  sessionHours: { min: 1, max: 168 },
  idleTimeoutMinutes: { min: 5, max: 1440 },
  maxSessions: { min: 1, max: 100 },
  ipAllowlist: { max: 200 },
};

export function securityDefaults(): SecuritySettings {
  return {
    sessionHours: 12,
    idleTimeoutMinutes: 60,
    maxSessions: 5,
    twoFactorRequiredRoles: [],
    ipAllowlistEnabled: false,
    ipAllowlist: [],
    ipAllowlistRoles: [],
    approvalActions: Object.fromEntries(SENSITIVE_ACTIONS.map((action) => [action.key, action.defaultOn])),
    updatedAt: null,
    updatedBy: null,
  };
}

function wholeNumber(value: unknown, fallback: number, limits: { min: number; max: number }): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= limits.min && value <= limits.max ? value : fallback;
}

function roleList(value: unknown): Role[] {
  if (!Array.isArray(value)) return [];
  const known = ROLES.map((role) => role.value);
  return known.filter((role) => value.includes(role));
}

/** The stored settings with every missing or invalid value replaced by its default. */
export function normaliseSecuritySettings(doc: any): SecuritySettings {
  const defaults = securityDefaults();
  if (!doc || typeof doc !== 'object') return defaults;

  const approvalActions = { ...defaults.approvalActions };
  if (doc.approvalActions && typeof doc.approvalActions === 'object') {
    for (const action of SENSITIVE_ACTIONS) {
      if (typeof doc.approvalActions[action.key] === 'boolean') approvalActions[action.key] = doc.approvalActions[action.key];
    }
  }

  const ipAllowlist = Array.isArray(doc.ipAllowlist)
    ? doc.ipAllowlist.filter((entry: unknown) => typeof entry === 'string' && parseIpRange(entry)).slice(0, SECURITY_LIMITS.ipAllowlist.max)
    : [];

  return {
    sessionHours: wholeNumber(doc.sessionHours, defaults.sessionHours, SECURITY_LIMITS.sessionHours),
    idleTimeoutMinutes: wholeNumber(doc.idleTimeoutMinutes, defaults.idleTimeoutMinutes, SECURITY_LIMITS.idleTimeoutMinutes),
    maxSessions: wholeNumber(doc.maxSessions, defaults.maxSessions, SECURITY_LIMITS.maxSessions),
    twoFactorRequiredRoles: roleList(doc.twoFactorRequiredRoles),
    ipAllowlistEnabled: doc.ipAllowlistEnabled === true,
    ipAllowlist,
    ipAllowlistRoles: roleList(doc.ipAllowlistRoles),
    approvalActions,
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy || null,
  };
}

export async function getSecuritySettings(db: Db): Promise<SecuritySettings> {
  const doc = await db.collection('settings').findOne({ type: SECURITY_SETTINGS_TYPE });
  return normaliseSecuritySettings(doc);
}

/** The values that are written to the activity log and compared for changes. */
export function securityAuditShape(settings: SecuritySettings) {
  return {
    sessionHours: settings.sessionHours,
    idleTimeoutMinutes: settings.idleTimeoutMinutes,
    maxSessions: settings.maxSessions,
    twoFactorRequiredRoles: settings.twoFactorRequiredRoles,
    ipAllowlistEnabled: settings.ipAllowlistEnabled,
    ipAllowlist: settings.ipAllowlist,
    ipAllowlistRoles: settings.ipAllowlistRoles,
    approvalActions: settings.approvalActions,
  };
}

/**
 * Checks values submitted from the Security Settings screen. Only the keys
 * that are present are changed. Returns the complete next settings.
 */
export function validateSecuritySettings(
  current: SecuritySettings,
  input: any
): { ok: true; value: SecuritySettings } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'The settings are not valid.' };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const next: SecuritySettings = { ...current, approvalActions: { ...current.approvalActions } };

  const number = (key: 'sessionHours' | 'idleTimeoutMinutes' | 'maxSessions', label: string): string | null => {
    if (!has(key)) return null;
    const value = input[key];
    const limits = SECURITY_LIMITS[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < limits.min || value > limits.max) {
      return `${label} must be a whole number from ${limits.min} to ${limits.max}.`;
    }
    next[key] = value;
    return null;
  };
  const numberError =
    number('sessionHours', 'Session length (hours)') ||
    number('idleTimeoutMinutes', 'Idle timeout (minutes)') ||
    number('maxSessions', 'Maximum sessions per admin');
  if (numberError) return { ok: false, error: numberError };
  if (next.idleTimeoutMinutes > next.sessionHours * 60) {
    return { ok: false, error: 'The idle timeout cannot be longer than the session length.' };
  }

  const roles = (key: 'twoFactorRequiredRoles' | 'ipAllowlistRoles', label: string): string | null => {
    if (!has(key)) return null;
    const value = input[key];
    if (!Array.isArray(value) || value.some((role) => typeof role !== 'string' || !ROLES.some((item) => item.value === role))) {
      return `${label} has an unknown role.`;
    }
    next[key] = roleList(value);
    return null;
  };
  const roleError = roles('twoFactorRequiredRoles', '2FA required for these roles') || roles('ipAllowlistRoles', 'Roles the IP rule applies to');
  if (roleError) return { ok: false, error: roleError };

  if (has('ipAllowlist')) {
    const value = input.ipAllowlist;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return { ok: false, error: 'The IP allow-list must be a list of addresses.' };
    if (value.length > SECURITY_LIMITS.ipAllowlist.max) return { ok: false, error: `The IP allow-list can hold at most ${SECURITY_LIMITS.ipAllowlist.max} entries.` };
    const cleaned: string[] = [];
    for (const raw of value as string[]) {
      const entry = raw.trim();
      if (!entry) continue;
      const parsed = parseIpRange(entry);
      if (!parsed) {
        return { ok: false, error: `"${entry.slice(0, 60)}" is not an IPv4 address or CIDR range. Use for example 203.0.113.7 or 203.0.113.0/24.` };
      }
      if (parsed.prefix < 8) return { ok: false, error: `"${entry}" covers too many addresses. The widest range allowed is /8.` };
      if (!cleaned.includes(parsed.text)) cleaned.push(parsed.text);
    }
    next.ipAllowlist = cleaned;
  }
  if (has('ipAllowlistEnabled')) {
    if (typeof input.ipAllowlistEnabled !== 'boolean') return { ok: false, error: 'The IP rule must be on or off.' };
    next.ipAllowlistEnabled = input.ipAllowlistEnabled;
  }
  if (next.ipAllowlistEnabled) {
    if (next.ipAllowlist.length === 0) return { ok: false, error: 'Add at least one address to the allow-list before switching the IP rule on.' };
    if (next.ipAllowlistRoles.length === 0) return { ok: false, error: 'Choose at least one role the IP rule applies to.' };
  }

  if (has('approvalActions')) {
    const value = input.approvalActions;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'The list of actions that need approval is not valid.' };
    for (const [key, on] of Object.entries(value)) {
      if (!sensitiveAction(key)) return { ok: false, error: 'Unknown action in the list of actions that need approval.' };
      if (typeof on !== 'boolean') return { ok: false, error: 'Each action that needs approval must be on or off.' };
      next.approvalActions[key] = on;
    }
  }

  return { ok: true, value: next };
}

export async function saveSecuritySettings(db: Db, settings: SecuritySettings, by: string | null): Promise<SecuritySettings> {
  const now = new Date();
  await db.collection('settings').updateOne(
    { type: SECURITY_SETTINGS_TYPE },
    {
      $set: { ...securityAuditShape(settings), updatedAt: now, updatedBy: by },
      $setOnInsert: { type: SECURITY_SETTINGS_TYPE, createdAt: now },
    },
    { upsert: true }
  );
  return getSecuritySettings(db);
}

/* ------------------------------------------------------------------ */
/* IP allow-list                                                       */
/* ------------------------------------------------------------------ */

function ipToNumber(ip: string): number | null {
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/** Parses "a.b.c.d" or "a.b.c.d/n". Returns null when it is neither. */
export function parseIpRange(entry: string): { base: number; prefix: number; text: string } | null {
  const [address, prefixText, extra] = String(entry).trim().split('/');
  if (extra !== undefined) return null;
  const base = ipToNumber(address);
  if (base === null) return null;
  let prefix = 32;
  if (prefixText !== undefined) {
    if (!/^\d{1,2}$/.test(prefixText)) return null;
    prefix = Number(prefixText);
    if (prefix > 32) return null;
  }
  const canonical = address.split('.').map(Number).join('.');
  return { base, prefix, text: prefix === 32 ? canonical : `${canonical}/${prefix}` };
}

/** "::ffff:203.0.113.7" (an IPv4 address written as IPv6) -> "203.0.113.7". */
export function normaliseIp(ip: string): string {
  return String(ip || '').trim().replace(/^::ffff:/i, '');
}

export function ipInList(ip: string, list: string[]): boolean {
  const value = ipToNumber(normaliseIp(ip));
  if (value === null) return false;
  for (const entry of list) {
    const range = parseIpRange(entry);
    if (!range) continue;
    if (range.prefix === 0) return true;
    const mask = (0xffffffff << (32 - range.prefix)) >>> 0;
    if (((value & mask) >>> 0) === ((range.base & mask) >>> 0)) return true;
  }
  return false;
}

export function ipRuleDisabledByEnvironment(): boolean {
  return String(process.env.SECURITY_IP_ALLOWLIST_DISABLED || '').toLowerCase() === 'true';
}

/** Whether the allow-list is in force for an admin of this role. */
export function ipRuleApplies(settings: SecuritySettings, role: string | null | undefined): boolean {
  if (!settings.ipAllowlistEnabled || ipRuleDisabledByEnvironment()) return false;
  const known = normaliseRole(role);
  return Boolean(known && settings.ipAllowlistRoles.includes(known));
}

/** True when the request may go ahead as far as the IP rule is concerned. */
export function ipAllowedFor(settings: SecuritySettings, role: string | null | undefined, ip: string): boolean {
  if (!ipRuleApplies(settings, role)) return true;
  return ipInList(ip, settings.ipAllowlist);
}

export function twoFactorRequiredFor(settings: SecuritySettings, role: string | null | undefined): boolean {
  const known = normaliseRole(role);
  return Boolean(known && settings.twoFactorRequiredRoles.includes(known));
}

/* ------------------------------------------------------------------ */
/* Security events                                                     */
/* ------------------------------------------------------------------ */

export type Severity = 'low' | 'medium' | 'high';

export const SECURITY_EVENT_TYPES: Record<string, { label: string; severity: Severity }> = {
  new_device: { label: 'Sign-in from a new device', severity: 'medium' },
  new_ip: { label: 'Sign-in from a new IP address', severity: 'medium' },
  failed_signins: { label: 'Repeated failed sign-ins', severity: 'medium' },
  account_locked: { label: 'Account locked after failed sign-ins', severity: 'high' },
  account_unlocked: { label: 'Account unlocked', severity: 'medium' },
  signin_ip_refused: { label: 'Sign-in refused by the IP rule', severity: 'high' },
  session_ip_refused: { label: 'Session ended by the IP rule', severity: 'high' },
  two_factor_enabled: { label: '2FA turned on', severity: 'low' },
  two_factor_disabled: { label: '2FA turned off', severity: 'high' },
  two_factor_reset: { label: '2FA reset by a Super Admin', severity: 'high' },
  recovery_code_used: { label: 'Sign-in with a recovery code', severity: 'medium' },
  recovery_codes_regenerated: { label: 'Recovery codes regenerated', severity: 'low' },
  password_changed: { label: 'Password changed', severity: 'medium' },
  password_reset: { label: 'Password reset by a Super Admin', severity: 'high' },
  role_changed: { label: 'Role changed', severity: 'high' },
  permissions_changed: { label: 'Extra permissions changed', severity: 'high' },
  admin_created: { label: 'Admin created', severity: 'medium' },
  admin_disabled: { label: 'Admin disabled', severity: 'medium' },
  admin_enabled: { label: 'Admin enabled', severity: 'medium' },
  session_ended_by_admin: { label: 'Session ended by another admin', severity: 'medium' },
  security_settings_changed: { label: 'Security settings changed', severity: 'medium' },
};

export const EMAIL_ALERT_TEMPLATE = 'security_alert';

export interface SecurityEventInput {
  type: keyof typeof SECURITY_EVENT_TYPES | string;
  /** The admin the event is about. */
  adminId?: string | null;
  adminEmail?: string | null;
  adminName?: string | null;
  /** Who caused it, when that is a different admin. */
  actorEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** One plain sentence saying what happened. */
  detail: string;
  meta?: Record<string, any> | null;
}

/**
 * The email template is created once so that alerts go out as soon as an
 * email provider is connected. Its wording can be edited under
 * Communications -> Templates.
 */
async function ensureAlertTemplate(db: Db) {
  const now = new Date();
  await db.collection('notificationTemplates').updateOne(
    { key: EMAIL_ALERT_TEMPLATE, channel: 'email' },
    {
      $setOnInsert: {
        key: EMAIL_ALERT_TEMPLATE,
        channel: 'email',
        name: 'Admin security alert',
        language: 'en',
        subject: 'Mookalaa admin security alert: {{title}}',
        body: '{{title}}\n\nAccount: {{account}}\nWhen: {{time}}\nIP address: {{ip}}\nDevice: {{device}}\n\n{{detail}}\n\nIf this was not expected, open Security & Audit in the admin panel.',
        status: 'approved',
        createdAt: now,
        updatedAt: now,
        createdBy: 'system',
        updatedBy: 'system',
      },
    },
    { upsert: true }
  );
}

/**
 * Records one security event and tries to email the admin concerned and the
 * active Super Admins. The email attempt goes through sendNotification, which
 * writes a delivery log entry and reports "not_sent" while no email provider
 * is connected: that real outcome is stored on the event. Never throws.
 */
export async function recordSecurityEvent(db: Db, input: SecurityEventInput): Promise<string | null> {
  try {
    const known = SECURITY_EVENT_TYPES[input.type];
    const now = new Date();
    const adminEmail = input.adminEmail ? String(input.adminEmail).toLowerCase() : null;
    const doc = {
      type: input.type,
      label: known?.label || input.type,
      severity: (known?.severity || 'medium') as Severity,
      adminId: input.adminId ? String(input.adminId) : null,
      adminEmail,
      adminName: input.adminName || null,
      actorEmail: input.actorEmail || null,
      ip: input.ip ? normaliseIp(input.ip) : null,
      userAgent: input.userAgent ? String(input.userAgent).slice(0, 400) : null,
      detail: String(input.detail || '').slice(0, 500),
      meta: input.meta || null,
      acknowledgedBy: null as string | null,
      acknowledgedAt: null as Date | null,
      acknowledgeNote: null as string | null,
      emailAlerts: [] as { to: string; status: string; error: string | null; logId: string | null }[],
      createdAt: now,
    };
    const inserted = await db.collection(SECURITY_EVENTS).insertOne(doc);

    // The alert emails must not hold up the request that caused the event (a
    // sign-in, for example): the caller waits at most three seconds, and the
    // outcome is written to the event whenever the sends finish.
    const alerting = (async () => {
      try {
        await ensureAlertTemplate(db);
        const supers = await db
          .collection('admins')
          .find({ role: { $in: ['super_admin', 'admin'] }, status: { $ne: 'disabled' } }, { projection: { email: 1 } })
          .limit(50)
          .toArray();
        const recipients = new Set<string>();
        // Only a real account is written to: an unknown email typed at sign-in is not.
        if (adminEmail && input.adminId) recipients.add(adminEmail);
        for (const admin of supers) if (admin.email) recipients.add(String(admin.email).toLowerCase());

        // Sent in parallel: one slow provider call must not hold up the others.
        const emailAlerts = await Promise.all(
          Array.from(recipients).map(async (to) => {
            const result = await sendNotification(db, {
            channel: 'email',
            to,
            templateKey: EMAIL_ALERT_TEMPLATE,
            variables: {
              title: doc.label,
              account: adminEmail || 'unknown',
              time: now.toISOString(),
              ip: doc.ip || 'unknown',
              device: doc.userAgent || 'unknown',
              detail: doc.detail,
            },
            requestedBy: 'security-alerts',
            });
            return { to, status: result.status, error: result.error, logId: result.logId };
          })
        );
        await db.collection(SECURITY_EVENTS).updateOne({ _id: inserted.insertedId }, { $set: { emailAlerts } });
      } catch (error) {
        console.error('Security alert email attempt failed:', error);
      }
    })();
    await Promise.race([alerting, new Promise((resolve) => setTimeout(resolve, 3000))]);

    return String(inserted.insertedId);
  } catch (error) {
    console.error('Failed to record a security event:', error);
    return null;
  }
}
