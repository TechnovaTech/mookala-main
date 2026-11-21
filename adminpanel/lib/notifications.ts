import { ObjectId, type Db } from 'mongodb';
import { decryptValue, encryptValue } from './crypto';

/**
 * Notification channels, templates and the delivery log. Server only.
 *
 * What is really connected today:
 *   sms       2Factor, one-time passwords only (sendOtpSms / verifyOtpSms).
 *             Sending any other SMS text is not implemented.
 *   email     no adapter
 *   whatsapp  no adapter
 *   push      no adapter, and the apps do not register device tokens
 *
 * Nothing in this file pretends a message went out. A delivery log entry is
 *   accepted   the provider accepted the message
 *   failed     the provider refused it (its error is stored)
 *   not_sent   nothing was handed to a provider (channel switched off, no
 *              credentials, no adapter, template not approved, ...)
 * "Delivered" would need provider delivery receipts, which are not connected.
 *
 * Channel settings live in the `settings` document { type: 'notifications' }.
 * Secrets are encrypted at rest and only ever leave this file masked, except
 * through getChannelConfig(), which is for server-side sending only.
 */

export const NOTIFICATION_SETTINGS_TYPE = 'notifications';
export const LOG_COLLECTION = 'notificationLogs';
export const TEMPLATE_COLLECTION = 'notificationTemplates';

export type Channel = 'sms' | 'email' | 'whatsapp' | 'push';
export const CHANNELS: Channel[] = ['sms', 'email', 'whatsapp', 'push'];

export type DeliveryStatus = 'accepted' | 'failed' | 'not_sent';
export type ChannelState = 'connected' | 'disabled' | 'not_configured' | 'adapter_missing';

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (CHANNELS as string[]).includes(value);
}

interface ChannelSpec {
  label: string;
  /** Name of the secret field for this channel. */
  secretKey: 'apiKey' | 'serverKey';
  /** A fixed provider, or null when the admin names the provider. */
  fixedProvider: string | null;
  /** Non-secret text settings. */
  fields: { key: string; label: string; help?: string; max: number }[];
  /** What this channel can really send today. */
  capability: string;
}

const SPEC: Record<Channel, ChannelSpec> = {
  sms: {
    label: 'SMS',
    secretKey: 'apiKey',
    fixedProvider: '2factor',
    fields: [
      { key: 'senderId', label: 'Sender ID', help: 'The 6-character DLT sender ID registered with 2Factor.', max: 20 },
      {
        key: 'otpTemplateName',
        label: 'OTP template name',
        help: 'The name of the approved OTP template in the 2Factor account. Leave empty to use the account default.',
        max: 60,
      },
    ],
    capability:
      'One-time passwords through 2Factor are implemented. Sending other SMS text (announcements, reminders) is not implemented yet.',
  },
  email: {
    label: 'Email',
    secretKey: 'apiKey',
    fixedProvider: null,
    fields: [{ key: 'fromAddress', label: 'From address', max: 200 }],
    capability: 'No email provider integration has been written yet. These details are stored but nothing is sent.',
  },
  whatsapp: {
    label: 'WhatsApp',
    secretKey: 'apiKey',
    fixedProvider: null,
    fields: [{ key: 'senderNumber', label: 'Sender number', max: 20 }],
    capability: 'No WhatsApp provider integration has been written yet. These details are stored but nothing is sent.',
  },
  push: {
    label: 'Push notifications',
    secretKey: 'serverKey',
    fixedProvider: 'fcm',
    fields: [],
    capability:
      'No push integration has been written yet, and the mobile apps do not register device tokens. These details are stored but nothing is sent.',
  },
};

export interface ChannelConfig {
  channel: Channel;
  provider: string;
  enabled: boolean;
  /** Decrypted secret. Server-side use only: never return it from an API. */
  secret: string;
  hasSecret: boolean;
  secretDecryptFailed: boolean;
  /** Non-secret settings such as senderId or fromAddress. */
  values: Record<string, string>;
  updatedAt: Date | null;
  updatedBy: string | null;
}

const DOT = '•';

function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 4) return DOT.repeat(secret.length);
  return DOT.repeat(Math.min(secret.length - 4, 20)) + secret.slice(-4);
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Whether a real sending adapter exists for the channel. OTP SMS is the only one today. */
function hasAdapter(channel: Channel): boolean {
  return channel === 'sms';
}

export function channelState(config: ChannelConfig): ChannelState {
  if (!hasAdapter(config.channel)) return 'adapter_missing';
  if (!config.hasSecret) return 'not_configured';
  if (!config.enabled) return 'disabled';
  return 'connected';
}

function readChannel(doc: any, channel: Channel): ChannelConfig {
  const spec = SPEC[channel];
  const stored = (doc && doc[channel]) || {};
  const rawSecret = stored[spec.secretKey];
  const secret = decryptValue(rawSecret) || '';
  const values: Record<string, string> = {};
  for (const field of spec.fields) values[field.key] = text(stored[field.key], field.max);

  return {
    channel,
    provider: spec.fixedProvider || text(stored.provider, 40),
    enabled: stored.enabled === true,
    secret,
    hasSecret: Boolean(secret),
    secretDecryptFailed: Boolean(rawSecret) && !secret,
    values,
    updatedAt: stored.updatedAt || null,
    updatedBy: stored.updatedBy || null,
  };
}

/** The channel's settings with the secret decrypted. For server-side sending only. */
export async function getChannelConfig(db: Db, channel: Channel): Promise<ChannelConfig> {
  const doc = await db.collection('settings').findOne({ type: NOTIFICATION_SETTINGS_TYPE });
  return readChannel(doc, channel);
}

export interface ChannelSummary {
  channel: Channel;
  label: string;
  provider: string;
  providerFixed: boolean;
  enabled: boolean;
  secretLabel: string;
  secretMasked: string;
  hasSecret: boolean;
  secretDecryptFailed: boolean;
  fields: { key: string; label: string; help?: string; value: string }[];
  state: ChannelState;
  capability: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

function summarise(config: ChannelConfig): ChannelSummary {
  const spec = SPEC[config.channel];
  return {
    channel: config.channel,
    label: spec.label,
    provider: config.provider,
    providerFixed: Boolean(spec.fixedProvider),
    enabled: config.enabled,
    secretLabel: spec.secretKey === 'serverKey' ? 'Server key' : 'API key',
    secretMasked: maskSecret(config.secret),
    hasSecret: config.hasSecret,
    secretDecryptFailed: config.secretDecryptFailed,
    fields: spec.fields.map((f) => ({ key: f.key, label: f.label, help: f.help, value: config.values[f.key] || '' })),
    state: channelState(config),
    capability: spec.capability,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

/** Every channel, with secrets masked. Safe to return to an admin screen. */
export async function getChannelSummaries(db: Db): Promise<ChannelSummary[]> {
  const doc = await db.collection('settings').findOne({ type: NOTIFICATION_SETTINGS_TYPE });
  return CHANNELS.map((channel) => summarise(readChannel(doc, channel)));
}

export interface SaveChannelInput {
  provider?: unknown;
  /** Leave empty to keep the stored secret. */
  secret?: unknown;
  /** true removes the stored secret. */
  clearSecret?: unknown;
  enabled?: unknown;
  values?: Record<string, unknown>;
}

/** What changed, without any secret value, for the audit log. */
function auditView(config: ChannelConfig) {
  return {
    provider: config.provider,
    enabled: config.enabled,
    credentialSaved: config.hasSecret,
    ...Object.fromEntries(
      // "otpTemplateName" would be hidden by the audit filter because of "otp" in its name.
      Object.entries(config.values).map(([key, value]) => [key === 'otpTemplateName' ? 'smsTemplateName' : key, value])
    ),
  };
}

export async function saveChannelConfig(
  db: Db,
  channel: Channel,
  input: SaveChannelInput,
  updatedBy: string | null
): Promise<
  | { ok: false; error: string }
  | { ok: true; summary: ChannelSummary; before: Record<string, any>; after: Record<string, any>; credentialChanged: boolean }
> {
  const spec = SPEC[channel];
  const current = await getChannelConfig(db, channel);

  const provider = spec.fixedProvider || text(input.provider, 40).toLowerCase();
  if (provider && !/^[a-z0-9 _.-]+$/.test(provider)) return { ok: false, error: 'Provider name has characters that are not allowed' };

  const newSecret = text(input.secret, 500);
  if (newSecret && /\s/.test(newSecret)) return { ok: false, error: `${spec.label}: the key must not contain spaces` };
  const clearSecret = input.clearSecret === true;

  const values: Record<string, string> = {};
  for (const field of spec.fields) {
    const supplied = input.values && field.key in input.values ? input.values[field.key] : current.values[field.key];
    values[field.key] = text(supplied, field.max);
  }
  if (channel === 'sms' && values.otpTemplateName && !/^[A-Za-z0-9 _-]+$/.test(values.otpTemplateName)) {
    return { ok: false, error: 'OTP template name may only contain letters, numbers, spaces, hyphens and underscores' };
  }
  if (channel === 'email' && values.fromAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.fromAddress)) {
    return { ok: false, error: 'From address is not a valid email address' };
  }

  const enabled = input.enabled === undefined ? current.enabled : input.enabled === true;
  const willHaveSecret = clearSecret ? false : Boolean(newSecret) || current.hasSecret;
  if (enabled && !willHaveSecret) {
    return { ok: false, error: `Save the ${spec.secretKey === 'serverKey' ? 'server key' : 'API key'} before switching this channel on` };
  }

  const now = new Date();
  const set: Record<string, any> = {
    [`${channel}.provider`]: provider,
    [`${channel}.enabled`]: enabled,
    [`${channel}.updatedAt`]: now,
    [`${channel}.updatedBy`]: updatedBy,
    updatedAt: now,
  };
  for (const [key, value] of Object.entries(values)) set[`${channel}.${key}`] = value;
  if (clearSecret) set[`${channel}.${spec.secretKey}`] = '';
  else if (newSecret) set[`${channel}.${spec.secretKey}`] = encryptValue(newSecret);

  await db
    .collection('settings')
    .updateOne({ type: NOTIFICATION_SETTINGS_TYPE }, { $set: set, $setOnInsert: { type: NOTIFICATION_SETTINGS_TYPE, createdAt: now } }, { upsert: true });

  const saved = await getChannelConfig(db, channel);
  return {
    ok: true,
    summary: summarise(saved),
    before: auditView(current),
    after: auditView(saved),
    credentialChanged: clearSecret ? current.hasSecret : Boolean(newSecret) && newSecret !== current.secret,
  };
}

/* ------------------------------------------------------------------ */
/* Delivery log                                                        */
/* ------------------------------------------------------------------ */

export interface DeliveryLogInput {
  channel: Channel;
  to: string;
  templateKey?: string | null;
  subject?: string | null;
  body?: string | null;
  status: DeliveryStatus;
  providerMessageId?: string | null;
  error?: string | null;
  campaignId?: string | null;
  /** "announcement", "push-campaign" or null for a single message. */
  campaignType?: string | null;
  attempt?: number;
  /** The log entry this one retries. */
  retryOf?: string | null;
  /** "otp" entries cannot be retried by an admin. */
  kind?: 'message' | 'otp' | 'campaign';
  bulk?: boolean;
  variables?: Record<string, string> | null;
  provider?: string | null;
  requestedBy?: string | null;
}

export async function logDelivery(db: Db, entry: DeliveryLogInput): Promise<string> {
  const result = await db.collection(LOG_COLLECTION).insertOne({
    channel: entry.channel,
    to: entry.to,
    templateKey: entry.templateKey || null,
    subject: entry.subject || null,
    body: entry.body ? entry.body.slice(0, 4000) : null,
    status: entry.status,
    provider: entry.provider || null,
    providerMessageId: entry.providerMessageId || null,
    error: entry.error ? entry.error.slice(0, 500) : null,
    campaignId: entry.campaignId || null,
    campaignType: entry.campaignType || null,
    attempt: entry.attempt || 1,
    retryOf: entry.retryOf || null,
    kind: entry.kind || 'message',
    bulk: entry.bulk === true,
    variables: entry.variables || null,
    requestedBy: entry.requestedBy || null,
    createdAt: new Date(),
  });
  return String(result.insertedId);
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/** Replaces {{name}} placeholders. Returns the placeholders that had no value. */
export function renderTemplate(source: string, variables: Record<string, any> = {}): { text: string; missing: string[] } {
  const missing: string[] = [];
  const rendered = String(source || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === null || value === '') {
      if (!missing.includes(name)) missing.push(name);
      return '';
    }
    return String(value);
  });
  return { text: rendered, missing };
}

/** The placeholders used in a template body or subject. */
export function templateVariables(source: string): string[] {
  const names = new Set<string>();
  String(source || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, name: string) => {
    names.add(name);
    return '';
  });
  return Array.from(names);
}

/** The template for a key and channel, preferring an approved one. */
export async function findTemplate(db: Db, key: string, channel: Channel) {
  const matches = await db.collection(TEMPLATE_COLLECTION).find({ key, channel }).toArray();
  return matches.find((t) => t.status === 'approved') || matches[0] || null;
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

export interface SendInput {
  channel: Channel;
  /** Phone number, email address or device token, depending on the channel. */
  to: string;
  templateKey: string;
  variables?: Record<string, any>;
  campaignId?: string | null;
  campaignType?: string | null;
  /** Bulk and emergency sends may only use approved templates. */
  bulk?: boolean;
  attempt?: number;
  retryOf?: string | null;
  requestedBy?: string | null;
}

export interface SendResult {
  status: DeliveryStatus;
  logId: string;
  error: string | null;
  providerMessageId: string | null;
}

interface ProviderResult {
  ok: boolean;
  messageId?: string | null;
  error?: string | null;
}

type MessageAdapter = (config: ChannelConfig, message: { to: string; subject: string; body: string; template: any }) => Promise<ProviderResult>;

/**
 * Adapters that send free-text messages. Empty on purpose: none has been
 * written. Adding a real adapter here is all that is needed to make a channel
 * live; until then sendNotification() records "not_sent".
 */
const MESSAGE_ADAPTERS: Partial<Record<Channel, MessageAdapter>> = {};

/** Why a channel cannot send a templated message right now, or null when it can. */
export function messageBlocker(config: ChannelConfig): string | null {
  const label = SPEC[config.channel].label;
  if (!MESSAGE_ADAPTERS[config.channel]) {
    if (config.channel === 'sms') {
      return 'SMS provider not connected for messages: only one-time passwords are implemented for 2Factor';
    }
    return `${config.channel} provider not connected`;
  }
  if (!config.hasSecret) return `${config.channel} provider not connected: no credentials saved`;
  if (!config.enabled) return `${label} channel is switched off`;
  return null;
}

/**
 * Renders a template and hands it to the channel's provider, when one is
 * really connected. Always writes one delivery log entry and never reports
 * success unless the provider accepted the message.
 */
export async function sendNotification(db: Db, input: SendInput): Promise<SendResult> {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.variables || {})) {
    if (value !== undefined && value !== null) variables[key] = String(value).slice(0, 2000);
  }

  const base: DeliveryLogInput = {
    channel: input.channel,
    to: String(input.to || '').slice(0, 300),
    templateKey: input.templateKey,
    status: 'not_sent',
    campaignId: input.campaignId || null,
    campaignType: input.campaignType || null,
    attempt: input.attempt || 1,
    retryOf: input.retryOf || null,
    bulk: input.bulk === true,
    variables,
    requestedBy: input.requestedBy || null,
  };

  const finish = async (entry: Partial<DeliveryLogInput>): Promise<SendResult> => {
    const merged = { ...base, ...entry } as DeliveryLogInput;
    const logId = await logDelivery(db, merged);
    return { status: merged.status, logId, error: merged.error || null, providerMessageId: merged.providerMessageId || null };
  };

  const template = await findTemplate(db, input.templateKey, input.channel);
  if (!template) {
    return finish({ error: `No ${input.channel} template with the key "${input.templateKey}" exists` });
  }
  if (template.status === 'retired') {
    return finish({ error: `Template "${input.templateKey}" is retired` });
  }
  if (input.bulk && template.status !== 'approved') {
    return finish({
      error: `Template "${input.templateKey}" is not approved: bulk and emergency messages may only use approved templates`,
    });
  }

  const subject = renderTemplate(template.subject || '', variables);
  const body = renderTemplate(template.body || '', variables);
  const rendered = { subject: subject.text, body: body.text };
  const missing = Array.from(new Set([...subject.missing, ...body.missing]));
  if (missing.length) {
    return finish({ ...rendered, error: `Missing values for template variables: ${missing.join(', ')}` });
  }
  const config = await getChannelConfig(db, input.channel);
  const blocker = messageBlocker(config);
  const adapter = MESSAGE_ADAPTERS[input.channel];
  if (blocker || !adapter) {
    return finish({ ...rendered, provider: config.provider || null, error: blocker || `${input.channel} provider not connected` });
  }
  if (!base.to) return finish({ ...rendered, provider: config.provider, error: 'The recipient has no address for this channel' });

  try {
    const outcome = await adapter(config, { to: base.to, subject: rendered.subject, body: rendered.body, template });
    return finish({
      ...rendered,
      provider: config.provider,
      status: outcome.ok ? 'accepted' : 'failed',
      providerMessageId: outcome.messageId || null,
      error: outcome.ok ? null : outcome.error || 'The provider refused the message',
    });
  } catch (error: any) {
    return finish({ ...rendered, provider: config.provider, status: 'failed', error: scrub(error?.message || 'Provider request failed', config.secret) });
  }
}

/**
 * Manual retry of a failed or unsent log entry. The original entry is kept and
 * marked as retried; the new attempt is a new entry.
 */
export async function retryDelivery(
  db: Db,
  logId: string,
  requestedBy: string | null
): Promise<{ ok: false; error: string; status: number } | { ok: true; result: SendResult }> {
  if (!ObjectId.isValid(logId) || logId.length !== 24) return { ok: false, error: 'Invalid log entry id', status: 400 };
  const entry = await db.collection(LOG_COLLECTION).findOne({ _id: new ObjectId(logId) });
  if (!entry) return { ok: false, error: 'Log entry not found', status: 404 };
  if (entry.status === 'accepted') return { ok: false, error: 'The provider accepted this message: it cannot be retried', status: 409 };
  if (entry.kind === 'otp') {
    return { ok: false, error: 'One-time passwords are not retried from here: the person signing in requests a new one', status: 409 };
  }
  if (entry.kind === 'campaign' || !entry.templateKey || !isChannel(entry.channel)) {
    return { ok: false, error: 'This entry is a campaign summary: send the campaign again from its own screen', status: 409 };
  }
  if (entry.retryLogId) return { ok: false, error: 'This entry has already been retried', status: 409 };

  const result = await sendNotification(db, {
    channel: entry.channel,
    to: entry.to,
    templateKey: entry.templateKey,
    variables: entry.variables || {},
    campaignId: entry.campaignId,
    campaignType: entry.campaignType,
    bulk: entry.bulk === true,
    attempt: (entry.attempt || 1) + 1,
    retryOf: logId,
    requestedBy,
  });

  await db
    .collection(LOG_COLLECTION)
    .updateOne({ _id: entry._id }, { $set: { retryLogId: result.logId, retriedAt: new Date(), retriedBy: requestedBy } });

  return { ok: true, result };
}

/* ------------------------------------------------------------------ */
/* 2Factor OTP SMS                                                     */
/* ------------------------------------------------------------------ */

/** TWOFACTOR_BASE_URL exists so tests can point at a local stub instead of sending a real SMS. */
function twoFactorBase(): string {
  return (process.env.TWOFACTOR_BASE_URL || 'https://2factor.in').replace(/\/+$/, '');
}

/** Removes the API key from any text before it is stored or returned. */
function scrub(message: string, secret: string): string {
  let out = String(message || '');
  if (secret) out = out.split(secret).join('[key]');
  return out.slice(0, 300);
}

async function twoFactorGet(url: string, secret: string): Promise<{ ok: boolean; details: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    const raw = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, details: `2Factor returned an unreadable response (HTTP ${response.status})` };
    }
    const details = typeof data.Details === 'string' ? data.Details : '';
    if (data.Status === 'Success') return { ok: true, details };
    return { ok: false, details: scrub(details || `2Factor refused the request (HTTP ${response.status})`, secret) };
  } catch (error: any) {
    if (error?.name === 'AbortError') return { ok: false, details: '2Factor did not answer within 10 seconds' };
    return { ok: false, details: scrub('Could not reach 2Factor: ' + (error?.message || 'network error'), secret) };
  } finally {
    clearTimeout(timer);
  }
}

/** 10-digit Indian numbers and numbers with a country code, digits only. */
function normalisePhone(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/[\s\-()+]/g, '');
  return /^\d{10,13}$/.test(digits) ? digits : null;
}

/**
 * Asks 2Factor to generate and send a one-time password.
 * The OTP itself is created by 2Factor and never reaches this server.
 * Keep the returned sessionId and pass it to verifyOtpSms with what the person typed.
 */
export async function sendOtpSms(
  db: Db,
  phone: string,
  options: { requestedBy?: string | null } = {}
): Promise<{ ok: boolean; sessionId: string | null; error: string | null }> {
  const to = normalisePhone(phone);
  if (!to) return { ok: false, sessionId: null, error: 'Enter a valid phone number' };

  const config = await getChannelConfig(db, 'sms');
  const log = (entry: Partial<DeliveryLogInput>) =>
    logDelivery(db, {
      channel: 'sms',
      to,
      templateKey: 'otp',
      body: 'One-time password generated and sent by 2Factor (the code is not stored here)',
      status: 'not_sent',
      kind: 'otp',
      provider: '2factor',
      requestedBy: options.requestedBy || null,
      ...entry,
    });

  if (!config.hasSecret) {
    const error = config.secretDecryptFailed
      ? 'SMS provider not connected: the saved 2Factor API key could not be read, save it again'
      : 'SMS provider not connected: no 2Factor API key has been saved';
    await log({ error });
    return { ok: false, sessionId: null, error };
  }
  if (!config.enabled) {
    const error = 'SMS channel is switched off';
    await log({ error });
    return { ok: false, sessionId: null, error };
  }

  const template = config.values.otpTemplateName;
  const url =
    `${twoFactorBase()}/API/V1/${encodeURIComponent(config.secret)}/SMS/${to}/AUTOGEN` +
    (template ? '/' + encodeURIComponent(template) : '');

  const outcome = await twoFactorGet(url, config.secret);
  if (outcome.ok && outcome.details) {
    await log({ status: 'accepted', providerMessageId: outcome.details });
    return { ok: true, sessionId: outcome.details, error: null };
  }

  const error = outcome.ok ? '2Factor accepted the request but returned no session id' : outcome.details;
  await log({ status: 'failed', error });
  return { ok: false, sessionId: null, error };
}

/** Checks the code a person typed against the session returned by sendOtpSms. */
export async function verifyOtpSms(db: Db, sessionId: string, otp: string): Promise<{ ok: boolean; error: string | null }> {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9-]{6,100}$/.test(sessionId)) {
    return { ok: false, error: 'Invalid OTP session' };
  }
  if (typeof otp !== 'string' || !/^\d{4,8}$/.test(otp)) return { ok: false, error: 'Enter the code that was sent by SMS' };

  const config = await getChannelConfig(db, 'sms');
  if (!config.hasSecret) return { ok: false, error: 'SMS provider not connected: no 2Factor API key has been saved' };

  const url = `${twoFactorBase()}/API/V1/${encodeURIComponent(config.secret)}/SMS/VERIFY/${sessionId}/${otp}`;
  const outcome = await twoFactorGet(url, config.secret);
  if (outcome.ok && /^otp matched$/i.test(outcome.details.trim())) return { ok: true, error: null };
  return { ok: false, error: outcome.details || 'The code could not be verified' };
}

/* ------------------------------------------------------------------ */
/* Audiences                                                           */
/* ------------------------------------------------------------------ */

export interface AudiencePart {
  collection: 'users' | 'artists' | 'organizers';
  label: string;
  filter: Record<string, any>;
}

const NOT_RESTRICTED = { accountStatus: { $nin: ['suspended', 'blocked'] } };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turns an audience choice into database queries. Suspended and blocked
 * accounts are left out. Returns an error string when the audience needs a
 * value that is missing or does not match anything.
 */
export async function resolveAudience(db: Db, audience: string, value?: string | null): Promise<AudiencePart[] | string> {
  const input = typeof value === 'string' ? value.trim() : '';
  switch (audience) {
    case 'all_users':
    case 'customers':
      return [{ collection: 'users', label: 'Customers', filter: { ...NOT_RESTRICTED } }];
    case 'artists':
      return [{ collection: 'artists', label: 'Artists', filter: { ...NOT_RESTRICTED } }];
    case 'organisers':
      return [{ collection: 'organizers', label: 'Organisers', filter: { ...NOT_RESTRICTED } }];
    case 'all':
      return [
        { collection: 'users', label: 'Customers', filter: { ...NOT_RESTRICTED } },
        { collection: 'artists', label: 'Artists', filter: { ...NOT_RESTRICTED } },
        { collection: 'organizers', label: 'Organisers', filter: { ...NOT_RESTRICTED } },
      ];
    case 'city': {
      if (!input) return 'Enter the city in "Audience value"';
      return [
        {
          collection: 'users',
          label: `Customers in ${input}`,
          filter: { ...NOT_RESTRICTED, city: { $regex: `^${escapeRegex(input)}$`, $options: 'i' } },
        },
      ];
    }
    case 'followers_of_artist': {
      if (!input) return 'Enter the artist\'s ID or phone number in "Audience value"';
      const byId = ObjectId.isValid(input) && input.length === 24 ? await db.collection('artists').findOne({ _id: new ObjectId(input) }, { projection: { name: 1 } }) : null;
      const artist = byId || (await db.collection('artists').findOne({ phone: input }, { projection: { name: 1 } }));
      if (!artist) return 'No artist matches the ID or phone number in "Audience value"';
      return [
        {
          collection: 'users',
          label: `Followers of ${artist.name || 'the artist'}`,
          // Follows have been stored both as ObjectIds and as text ids.
          filter: { ...NOT_RESTRICTED, followedArtists: { $in: [artist._id, String(artist._id)] } },
        },
      ];
    }
    default:
      return 'Unknown audience';
  }
}

export async function countAudience(db: Db, parts: AudiencePart[]) {
  const breakdown = await Promise.all(
    parts.map(async (part) => ({ label: part.label, count: await db.collection(part.collection).countDocuments(part.filter) }))
  );
  return { total: breakdown.reduce((sum, b) => sum + b.count, 0), breakdown };
}

export interface Recipient {
  type: 'user' | 'artist' | 'organizer';
  name: string;
  phone: string;
  email: string;
}

/** A stable, paged slice of the audience (ordered by collection, then _id). */
export async function loadRecipients(db: Db, parts: AudiencePart[], skip: number, limit: number): Promise<Recipient[]> {
  const out: Recipient[] = [];
  let toSkip = skip;
  for (const part of parts) {
    if (out.length >= limit) break;
    const size = await db.collection(part.collection).countDocuments(part.filter);
    if (toSkip >= size) {
      toSkip -= size;
      continue;
    }
    const docs = await db
      .collection(part.collection)
      .find(part.filter, { projection: { name: 1, phone: 1, email: 1 } })
      .sort({ _id: 1 })
      .skip(toSkip)
      .limit(limit - out.length)
      .toArray();
    toSkip = 0;
    const type = part.collection === 'users' ? 'user' : part.collection === 'artists' ? 'artist' : 'organizer';
    for (const doc of docs) {
      out.push({ type, name: text(doc.name, 120), phone: text(doc.phone, 20), email: text(doc.email, 200) });
    }
  }
  return out;
}

/** The address a recipient has for a channel. Push needs a device token, which no account has yet. */
export function addressFor(recipient: Recipient, channel: Channel): string {
  if (channel === 'email') return recipient.email;
  if (channel === 'push') return '';
  return recipient.phone;
}

/** Largest number of recipients one "send" run will process. */
export const MAX_RECIPIENTS_PER_RUN = 200;
