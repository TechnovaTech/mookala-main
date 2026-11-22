import crypto from 'crypto';
import { ObjectId, type Db } from 'mongodb';
import { decryptValue, encryptValue } from './crypto';

/**
 * Notification channels, providers, templates, sending and the delivery log.
 * Server only.
 *
 * What is really connected:
 *   sms       2Factor, one-time passwords only (sendOtpSms / verifyOtpSms).
 *             Sending other SMS text is NOT implemented: 2Factor's
 *             transactional SMS API was not implemented because its exact
 *             current endpoint could not be confirmed here.
 *   email     SendGrid (POST /v3/mail/send) or Resend (POST /emails)
 *   whatsapp  Meta WhatsApp Cloud API, approved message templates only
 *   push      Firebase Cloud Messaging HTTP v1, with a service account
 *             (RS256 JWT exchanged for an OAuth access token)
 *
 * Every provider base URL can be pointed at a local stub for tests:
 *   TWOFACTOR_BASE_URL, SENDGRID_BASE_URL, RESEND_BASE_URL,
 *   WHATSAPP_BASE_URL, FCM_BASE_URL, FCM_TOKEN_URL
 *
 * A delivery log entry moves through
 *   queued -> accepted -> delivered -> read      (receipts from webhooks)
 *                      \-> failed                 (refused, bounced, ...)
 *   not_sent   nothing was handed to a provider (channel off, no credentials,
 *              no adapter, template not approved, no address, ...)
 * Every change is kept in the entry's `events`. A retry is a new entry with
 * the next attempt number, linked by `retryOf` / `retryLogId`.
 *
 * Channel settings live in the `settings` document { type: 'notifications' }.
 * Secrets are encrypted at rest and only ever leave this file masked, except
 * through getChannelConfig(), which is for server-side sending only.
 */

export const NOTIFICATION_SETTINGS_TYPE = 'notifications';
export const LOG_COLLECTION = 'notificationLogs';
export const TEMPLATE_COLLECTION = 'notificationTemplates';
export const DEVICE_COLLECTION = 'deviceTokens';
export const RECEIPT_COLLECTION = 'notificationWebhookEvents';

export type Channel = 'sms' | 'email' | 'whatsapp' | 'push';
export const CHANNELS: Channel[] = ['sms', 'email', 'whatsapp', 'push'];

/** Immediate outcome of one send attempt. */
export type SendStatus = 'accepted' | 'failed' | 'not_sent';
/** Every status a delivery log entry can have. */
export type DeliveryStatus = 'queued' | SendStatus | 'delivered' | 'read';
export const DELIVERY_STATUSES: DeliveryStatus[] = ['queued', 'accepted', 'delivered', 'read', 'failed', 'not_sent'];
export type ChannelState = 'connected' | 'disabled' | 'not_configured' | 'adapter_missing';

/** Attempts (the first one included) the scheduler makes for a transient provider error. */
export const MAX_AUTO_ATTEMPTS = 3;
/** Minutes to wait before automatic attempt 2 and attempt 3. */
export const RETRY_BACKOFF_MINUTES = [10, 30];

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (CHANNELS as string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Providers and channel settings                                      */
/* ------------------------------------------------------------------ */

interface ProviderSpec {
  label: string;
  envVar: string;
  defaultBase: string;
}

const PROVIDERS: Record<string, ProviderSpec> = {
  '2factor': { label: '2Factor', envVar: 'TWOFACTOR_BASE_URL', defaultBase: 'https://2factor.in' },
  sendgrid: { label: 'SendGrid', envVar: 'SENDGRID_BASE_URL', defaultBase: 'https://api.sendgrid.com' },
  resend: { label: 'Resend', envVar: 'RESEND_BASE_URL', defaultBase: 'https://api.resend.com' },
  meta: { label: 'Meta WhatsApp Cloud API', envVar: 'WHATSAPP_BASE_URL', defaultBase: 'https://graph.facebook.com' },
  fcm: { label: 'Firebase Cloud Messaging (HTTP v1)', envVar: 'FCM_BASE_URL', defaultBase: 'https://fcm.googleapis.com' },
};

/** The audience Google expects in the service-account JWT, whatever URL the token is fetched from. */
const GOOGLE_TOKEN_AUDIENCE = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function providerBase(provider: string): string {
  const spec = PROVIDERS[provider];
  if (!spec) return '';
  return (process.env[spec.envVar] || spec.defaultBase).replace(/\/+$/, '');
}

function fcmTokenUrl(): string {
  return process.env.FCM_TOKEN_URL || GOOGLE_TOKEN_AUDIENCE;
}

interface SecretSpec {
  key: string;
  label: string;
  /** Name used in the activity log, chosen so the audit filter does not hide the yes/no value. */
  auditName: string;
  help?: string;
  multiline?: boolean;
  /** Only used with these providers. */
  providers?: string[];
  max: number;
}

interface FieldSpec {
  key: string;
  label: string;
  help?: string;
  max: number;
  providers?: string[];
  placeholder?: string;
  pattern?: RegExp;
  patternError?: string;
}

interface ChannelSpec {
  label: string;
  /** Allowed providers. One entry means the provider is fixed. */
  providers: string[];
  /** secrets[0] is the credential used to send. */
  secrets: SecretSpec[];
  fields: FieldSpec[];
}

const SPEC: Record<Channel, ChannelSpec> = {
  sms: {
    label: 'SMS',
    providers: ['2factor'],
    secrets: [{ key: 'apiKey', label: 'API key', auditName: 'credentialSaved', max: 200 }],
    fields: [
      { key: 'senderId', label: 'Sender ID', help: 'The 6-character DLT sender ID registered with 2Factor.', max: 20 },
      {
        key: 'otpTemplateName',
        label: 'OTP template name',
        help: 'The name of the approved OTP template in the 2Factor account. Leave empty to use the account default.',
        max: 60,
        pattern: /^[A-Za-z0-9 _-]*$/,
        patternError: 'OTP template name may only contain letters, numbers, spaces, hyphens and underscores',
      },
    ],
  },
  email: {
    label: 'Email',
    providers: ['sendgrid', 'resend'],
    secrets: [
      { key: 'apiKey', label: 'API key', auditName: 'credentialSaved', max: 500 },
      {
        key: 'webhookSecret',
        label: 'Webhook URL key',
        auditName: 'webhookUrlKeySaved',
        providers: ['sendgrid'],
        max: 200,
        help: 'Used only when no verification key is saved. SendGrid must call the event webhook URL with ?key= followed by this value.',
      },
      {
        key: 'signingSecret',
        label: 'Webhook signing secret',
        auditName: 'webhookSigningKeySaved',
        providers: ['resend'],
        max: 200,
        help: 'The whsec_... signing secret Resend shows for the webhook. Status updates without a valid signature are refused.',
      },
    ],
    fields: [
      {
        key: 'fromAddress',
        label: 'From address',
        help: 'Must be a sender or domain verified with the provider.',
        max: 200,
        pattern: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        patternError: 'From address is not a valid email address',
      },
      { key: 'fromName', label: 'From name', max: 100, placeholder: 'Mookalaa' },
      {
        key: 'webhookPublicKey',
        label: 'Event webhook verification key',
        providers: ['sendgrid'],
        max: 400,
        help: 'The public key SendGrid shows when "Signed Event Webhook" is switched on. When set, unsigned status updates are refused.',
        pattern: /^[A-Za-z0-9+/=]*$/,
        patternError: 'The verification key must be the base64 text SendGrid shows',
      },
    ],
  },
  whatsapp: {
    label: 'WhatsApp',
    providers: ['meta'],
    secrets: [
      { key: 'apiKey', label: 'Access token', auditName: 'credentialSaved', max: 1000 },
      {
        key: 'appSecret',
        label: 'App secret',
        auditName: 'appSigningKeySaved',
        max: 200,
        help: 'From the Meta app dashboard. Used to check the X-Hub-Signature-256 of status webhooks; without it they are refused.',
      },
      {
        key: 'verifyToken',
        label: 'Webhook verify token',
        auditName: 'webhookVerifyValueSaved',
        max: 200,
        help: 'Any long random text. Type the same value as the verify token in the Meta webhook settings.',
      },
    ],
    fields: [
      {
        key: 'phoneNumberId',
        label: 'Phone number ID',
        help: 'The WhatsApp Business phone number ID (not the phone number itself), from WhatsApp Manager > API setup.',
        max: 30,
        pattern: /^\d*$/,
        patternError: 'Phone number ID must contain digits only',
      },
      {
        key: 'apiVersion',
        label: 'Graph API version',
        help: 'For example v22.0. Leave empty to use v22.0.',
        max: 10,
        placeholder: 'v22.0',
        pattern: /^$|^v\d{1,3}\.\d{1,2}$/,
        patternError: 'Graph API version looks like v22.0',
      },
    ],
  },
  push: {
    label: 'Push notifications',
    providers: ['fcm'],
    secrets: [
      {
        key: 'serverKey',
        label: 'Service account JSON',
        auditName: 'credentialSaved',
        multiline: true,
        max: 10000,
        help: 'Firebase console > Project settings > Service accounts > Generate new private key. Paste the whole JSON file.',
      },
    ],
    fields: [],
  },
};

export interface ChannelConfig {
  channel: Channel;
  provider: string;
  enabled: boolean;
  /** Decrypted credential (secrets[0]). Server-side use only: never return it from an API. */
  secret: string;
  hasSecret: boolean;
  secretDecryptFailed: boolean;
  /** Every decrypted secret of the channel, by key. Server-side use only. */
  secrets: Record<string, string>;
  secretDecryptFailures: string[];
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

function appliesTo(item: { providers?: string[] }, provider: string): boolean {
  return !item.providers || item.providers.includes(provider);
}

function readChannel(doc: any, channel: Channel): ChannelConfig {
  const spec = SPEC[channel];
  const stored = (doc && doc[channel]) || {};
  const secrets: Record<string, string> = {};
  const failures: string[] = [];
  for (const item of spec.secrets) {
    const raw = stored[item.key];
    const plain = decryptValue(raw) || '';
    secrets[item.key] = plain;
    if (raw && !plain) failures.push(item.key);
  }
  const values: Record<string, string> = {};
  for (const field of spec.fields) values[field.key] = text(stored[field.key], field.max);

  const storedProvider = text(stored.provider, 40).toLowerCase();
  const provider = spec.providers.length === 1 ? spec.providers[0] : spec.providers.includes(storedProvider) ? storedProvider : '';
  const credentialKey = spec.secrets[0].key;

  return {
    channel,
    provider,
    enabled: stored.enabled === true,
    secret: secrets[credentialKey],
    hasSecret: Boolean(secrets[credentialKey]),
    secretDecryptFailed: failures.includes(credentialKey),
    secrets,
    secretDecryptFailures: failures,
    values,
    updatedAt: stored.updatedAt || null,
    updatedBy: stored.updatedBy || null,
  };
}

/** The channel's settings with the secrets decrypted. For server-side sending only. */
export async function getChannelConfig(db: Db, channel: Channel): Promise<ChannelConfig> {
  const doc = await db.collection('settings').findOne({ type: NOTIFICATION_SETTINGS_TYPE });
  return readChannel(doc, channel);
}

/* ---------- push service account ---------- */

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  privateKeyId: string;
}

function parseServiceAccount(raw: string): ServiceAccount | string {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'it is not valid JSON';
  }
  if (!data || typeof data !== 'object') return 'it is not a JSON object';
  if (data.type !== 'service_account') return 'its "type" is not "service_account"';
  const projectId = typeof data.project_id === 'string' ? data.project_id.trim() : '';
  const clientEmail = typeof data.client_email === 'string' ? data.client_email.trim() : '';
  const privateKey = typeof data.private_key === 'string' ? data.private_key : '';
  if (!/^[a-z0-9-]{4,40}$/.test(projectId)) return '"project_id" is missing or not a Firebase project id';
  if (!/^[^\s@]+@[^\s@]+$/.test(clientEmail)) return '"client_email" is missing';
  if (!privateKey.includes('PRIVATE KEY')) return '"private_key" is missing';
  try {
    crypto.createPrivateKey(privateKey);
  } catch {
    return '"private_key" cannot be read as a private key';
  }
  return { projectId, clientEmail, privateKey, privateKeyId: typeof data.private_key_id === 'string' ? data.private_key_id : '' };
}

/* ---------- configuration state ---------- */

/** Why the channel cannot send with its saved settings, or null when everything needed is saved. */
function configurationProblem(config: ChannelConfig): string | null {
  const v = config.values;
  switch (config.channel) {
    case 'sms':
      if (config.secretDecryptFailed) return 'the saved 2Factor API key cannot be read, save it again';
      return config.hasSecret ? null : 'no 2Factor API key saved';
    case 'email':
      if (!config.provider) return 'choose SendGrid or Resend as the provider';
      if (config.secretDecryptFailed) return 'the saved API key cannot be read, save it again';
      if (!config.hasSecret) return 'no API key saved';
      if (!v.fromAddress) return 'no from address saved';
      return null;
    case 'whatsapp':
      if (config.secretDecryptFailed) return 'the saved access token cannot be read, save it again';
      if (!config.hasSecret) return 'no access token saved';
      if (!v.phoneNumberId) return 'no phone number ID saved';
      return null;
    case 'push': {
      if (config.secretDecryptFailed) return 'the saved service account cannot be read, save it again';
      if (!config.hasSecret) return 'no service account JSON saved';
      const parsed = parseServiceAccount(config.secret);
      return typeof parsed === 'string' ? `the saved service account is not usable: ${parsed}` : null;
    }
  }
}

/** Whether a real adapter exists for templated messages on this channel and provider. */
function hasMessageAdapter(config: ChannelConfig): boolean {
  return Boolean(config.provider && MESSAGE_ADAPTERS[config.provider] && config.channel !== 'sms');
}

/** State for templated messages (announcements, reminders, alerts). */
export function channelState(config: ChannelConfig): ChannelState {
  // Email has two adapters: until one is chosen the channel is simply not configured.
  if (config.channel === 'email' && !config.provider) return 'not_configured';
  if (!hasMessageAdapter(config)) return 'adapter_missing';
  if (configurationProblem(config)) return 'not_configured';
  if (!config.enabled) return 'disabled';
  return 'connected';
}

/** State of the 2Factor one-time-password adapter. */
function otpState(config: ChannelConfig): ChannelState {
  if (configurationProblem(config)) return 'not_configured';
  if (!config.enabled) return 'disabled';
  return 'connected';
}

export interface ChannelSummary {
  channel: Channel;
  label: string;
  provider: string;
  providerLabel: string;
  providerOptions: { value: string; label: string }[];
  providerFixed: boolean;
  enabled: boolean;
  /** The credential, masked. Kept for older screens. */
  secretLabel: string;
  secretMasked: string;
  hasSecret: boolean;
  secretDecryptFailed: boolean;
  secrets: {
    key: string;
    label: string;
    help?: string;
    multiline: boolean;
    providers: string[] | null;
    saved: boolean;
    masked: string;
    decryptFailed: boolean;
  }[];
  fields: { key: string; label: string; help?: string; value: string; providers: string[] | null; placeholder?: string }[];
  /** Read-only facts taken from the saved settings, e.g. the Firebase project of the service account. */
  derived: { label: string; value: string }[];
  state: ChannelState;
  capabilities: { label: string; state: ChannelState }[];
  configurationProblem: string | null;
  /** Where requests go, so an admin can see a test override. */
  endpoint: { url: string; overriddenBy: string | null } | null;
  capability: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

function endpointOf(provider: string): ChannelSummary['endpoint'] {
  const spec = PROVIDERS[provider];
  if (!spec) return null;
  const overridden = Boolean(process.env[spec.envVar]);
  return { url: providerBase(provider), overriddenBy: overridden ? spec.envVar : null };
}

const CAPABILITY: Record<Channel, string> = {
  sms:
    'One-time passwords for sign-in go through 2Factor. Sending other SMS text (announcements, reminders) is not implemented: the 2Factor transactional SMS API was not built because its exact endpoint could not be confirmed.',
  email: 'Templated email through SendGrid or Resend. Delivered, opened and bounced statuses arrive through the provider webhook.',
  whatsapp:
    'Approved WhatsApp message templates through the Meta WhatsApp Cloud API. Sent, delivered, read and failed statuses arrive through the Meta webhook.',
  push:
    'Push notifications through Firebase Cloud Messaging to device tokens the apps register. The mobile apps do not include Firebase yet, so no device registers a token until they do.',
};

function summarise(config: ChannelConfig): ChannelSummary {
  const spec = SPEC[config.channel];
  const credential = spec.secrets[0];
  const derived: { label: string; value: string }[] = [];
  if (config.channel === 'push' && config.hasSecret) {
    const parsed = parseServiceAccount(config.secret);
    if (typeof parsed !== 'string') {
      derived.push({ label: 'Firebase project', value: parsed.projectId });
      derived.push({ label: 'Service account', value: parsed.clientEmail });
    }
  }
  const masked = (key: string) => {
    const value = config.secrets[key] || '';
    if (config.channel === 'push' && key === 'serverKey' && value) {
      const parsed = parseServiceAccount(value);
      return typeof parsed === 'string' ? 'Saved (not a usable service account)' : `Saved: ${parsed.clientEmail}`;
    }
    return maskSecret(value);
  };
  const capabilities: { label: string; state: ChannelState }[] =
    config.channel === 'sms'
      ? [
          { label: 'One-time passwords (sign-in)', state: otpState(config) },
          { label: 'Other SMS (announcements, reminders)', state: 'adapter_missing' },
        ]
      : [{ label: 'Messages', state: channelState(config) }];

  return {
    channel: config.channel,
    label: spec.label,
    provider: config.provider,
    providerLabel: PROVIDERS[config.provider]?.label || '',
    providerOptions: spec.providers.map((value) => ({ value, label: PROVIDERS[value].label })),
    providerFixed: spec.providers.length === 1,
    enabled: config.enabled,
    secretLabel: credential.label,
    secretMasked: masked(credential.key),
    hasSecret: config.hasSecret,
    secretDecryptFailed: config.secretDecryptFailed,
    secrets: spec.secrets.map((item) => ({
      key: item.key,
      label: item.label,
      help: item.help,
      multiline: Boolean(item.multiline),
      providers: item.providers || null,
      saved: Boolean(config.secrets[item.key]),
      masked: masked(item.key),
      decryptFailed: config.secretDecryptFailures.includes(item.key),
    })),
    fields: spec.fields.map((f) => ({
      key: f.key,
      label: f.label,
      help: f.help,
      value: config.values[f.key] || '',
      providers: f.providers || null,
      placeholder: f.placeholder,
    })),
    derived,
    state: config.channel === 'sms' ? otpState(config) : channelState(config),
    capabilities,
    configurationProblem: configurationProblem(config),
    endpoint: config.provider ? endpointOf(config.provider) : null,
    capability: CAPABILITY[config.channel],
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
  /** New secrets by key. An empty value keeps the stored one. */
  secrets?: Record<string, unknown>;
  /** Secret keys to remove, or true to remove every secret of the channel. */
  clearSecrets?: unknown;
  /** Older form: the credential alone. */
  secret?: unknown;
  /** Older form: true removes every stored secret. */
  clearSecret?: unknown;
  enabled?: unknown;
  values?: Record<string, unknown>;
}

export interface ChannelPlan {
  provider: string;
  enabled: boolean;
  values: Record<string, string>;
  /** Plain-text secrets to store, by key. */
  setSecrets: Record<string, string>;
  clearSecrets: string[];
  /** The channel as it would be after the change, for the checks. */
  next: ChannelConfig;
  /** Without any secret value, for the approver and the activity log. */
  before: Record<string, any>;
  after: Record<string, any>;
  /** sha256 of each new secret, so an approval is tied to this exact value. */
  fingerprints: Record<string, string>;
}

/** What the activity log and the approver see: whether each secret is saved, never its value. */
function auditView(config: ChannelConfig): Record<string, any> {
  const spec = SPEC[config.channel];
  const view: Record<string, any> = { provider: config.provider, enabled: config.enabled };
  for (const item of spec.secrets) {
    if (!appliesTo(item, config.provider) && !config.secrets[item.key]) continue;
    view[item.auditName] = Boolean(config.secrets[item.key]);
  }
  for (const [key, value] of Object.entries(config.values)) {
    // "otpTemplateName" would be hidden by the audit filter because of "otp" in its name.
    view[key === 'otpTemplateName' ? 'smsTemplateName' : key] = value;
  }
  return view;
}

/**
 * Checks a requested change against the saved settings without writing
 * anything. Used before a change is sent for approval and again when it is
 * saved, so an approver is never asked to agree to a change that would then
 * be refused.
 */
export function planChannelSave(current: ChannelConfig, input: SaveChannelInput): { ok: false; error: string } | ({ ok: true } & ChannelPlan) {
  const channel = current.channel;
  const spec = SPEC[channel];

  let provider = current.provider;
  if (spec.providers.length === 1) provider = spec.providers[0];
  else if (input.provider !== undefined) {
    const requested = text(input.provider, 40).toLowerCase();
    if (requested && !spec.providers.includes(requested)) {
      return { ok: false, error: `Choose one of: ${spec.providers.map((p) => PROVIDERS[p].label).join(', ')}` };
    }
    provider = requested;
  }

  const supplied: Record<string, unknown> = { ...(input.secrets && typeof input.secrets === 'object' ? input.secrets : {}) };
  if (input.secret !== undefined && supplied[spec.secrets[0].key] === undefined) supplied[spec.secrets[0].key] = input.secret;

  const setSecrets: Record<string, string> = {};
  for (const item of spec.secrets) {
    const raw = supplied[item.key];
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value) continue;
    if (value.length > item.max) return { ok: false, error: `${spec.label}: the ${item.label.toLowerCase()} is too long` };
    if (!item.multiline && /\s/.test(value)) return { ok: false, error: `${spec.label}: the ${item.label.toLowerCase()} must not contain spaces` };
    if (channel === 'push' && item.key === 'serverKey') {
      const parsed = parseServiceAccount(value);
      if (typeof parsed === 'string') return { ok: false, error: `The service account JSON cannot be used: ${parsed}` };
    }
    if (channel === 'email' && item.key === 'signingSecret' && !/^whsec_[A-Za-z0-9+/=]{16,}$/.test(value)) {
      return { ok: false, error: 'The Resend signing secret starts with whsec_' };
    }
    if (item.key === 'verifyToken' && value.length < 12) return { ok: false, error: 'Use at least 12 characters for the webhook verify token' };
    if (item.key === 'webhookSecret' && value.length < 16) return { ok: false, error: 'Use at least 16 characters for the webhook URL key' };
    setSecrets[item.key] = value;
  }

  let clearSecrets: string[] = [];
  if (input.clearSecrets === true || input.clearSecret === true) clearSecrets = spec.secrets.map((s) => s.key);
  else if (Array.isArray(input.clearSecrets)) {
    clearSecrets = input.clearSecrets.filter((key): key is string => typeof key === 'string' && spec.secrets.some((s) => s.key === key));
  }
  for (const key of clearSecrets) delete setSecrets[key];

  const values: Record<string, string> = {};
  for (const field of spec.fields) {
    const raw = input.values && typeof input.values === 'object' && field.key in input.values ? input.values[field.key] : current.values[field.key];
    const value = text(raw, field.max);
    if (field.pattern && !field.pattern.test(value)) return { ok: false, error: field.patternError || `${field.label} is not valid` };
    values[field.key] = value;
  }

  const nextSecrets = { ...current.secrets };
  for (const key of clearSecrets) nextSecrets[key] = '';
  Object.assign(nextSecrets, setSecrets);
  const credentialKey = spec.secrets[0].key;
  const enabled = input.enabled === undefined ? current.enabled : input.enabled === true;

  const next: ChannelConfig = {
    ...current,
    provider,
    enabled,
    secrets: nextSecrets,
    secret: nextSecrets[credentialKey] || '',
    hasSecret: Boolean(nextSecrets[credentialKey]),
    secretDecryptFailed: setSecrets[credentialKey] || clearSecrets.includes(credentialKey) ? false : current.secretDecryptFailed,
    secretDecryptFailures: current.secretDecryptFailures.filter((key) => !(key in setSecrets) && !clearSecrets.includes(key)),
    values,
  };

  if (enabled) {
    const problem = configurationProblem(next);
    if (problem) return { ok: false, error: `${spec.label} cannot be switched on yet: ${problem}` };
  }

  const before = auditView(current);
  const after = auditView(next);
  const fingerprints: Record<string, string> = {};
  for (const [key, value] of Object.entries(setSecrets)) {
    fingerprints[key] = crypto.createHash('sha256').update(value).digest('hex');
    const item = spec.secrets.find((s) => s.key === key)!;
    if (current.secrets[key] && current.secrets[key] !== value) {
      before[item.auditName] = 'a value is saved';
      after[item.auditName] = 'replaced with a new value';
    }
  }

  return { ok: true, provider, enabled, values, setSecrets, clearSecrets, next, before, after, fingerprints };
}

export async function saveChannelConfig(
  db: Db,
  channel: Channel,
  input: SaveChannelInput,
  updatedBy: string | null
): Promise<
  | { ok: false; error: string }
  | { ok: true; summary: ChannelSummary; before: Record<string, any>; after: Record<string, any>; credentialChanged: boolean; secretsChanged: string[] }
> {
  const spec = SPEC[channel];
  const current = await getChannelConfig(db, channel);
  const plan = planChannelSave(current, input);
  if (!plan.ok) return plan;

  const now = new Date();
  const set: Record<string, any> = {
    [`${channel}.provider`]: plan.provider,
    [`${channel}.enabled`]: plan.enabled,
    [`${channel}.updatedAt`]: now,
    [`${channel}.updatedBy`]: updatedBy,
    updatedAt: now,
  };
  for (const [key, value] of Object.entries(plan.values)) set[`${channel}.${key}`] = value;
  for (const key of plan.clearSecrets) set[`${channel}.${key}`] = '';
  for (const [key, value] of Object.entries(plan.setSecrets)) set[`${channel}.${key}`] = encryptValue(value);
  if (channel === 'push') {
    const parsed = plan.next.hasSecret ? parseServiceAccount(plan.next.secret) : null;
    set['push.projectId'] = parsed && typeof parsed !== 'string' ? parsed.projectId : '';
  }

  await db
    .collection('settings')
    .updateOne({ type: NOTIFICATION_SETTINGS_TYPE }, { $set: set, $setOnInsert: { type: NOTIFICATION_SETTINGS_TYPE, createdAt: now } }, { upsert: true });

  if (channel === 'push') accessTokens.clear();

  const saved = await getChannelConfig(db, channel);
  const credentialKey = spec.secrets[0].key;
  const secretsChanged = [
    ...plan.clearSecrets.filter((key) => current.secrets[key]),
    ...Object.keys(plan.setSecrets).filter((key) => plan.setSecrets[key] !== current.secrets[key]),
  ];
  return {
    ok: true,
    summary: summarise(saved),
    before: plan.before,
    after: plan.after,
    credentialChanged: secretsChanged.includes(credentialKey),
    secretsChanged,
  };
}

/* ------------------------------------------------------------------ */
/* Indexes                                                             */
/* ------------------------------------------------------------------ */

let indexesReady: Promise<void> | null = null;

/** Creates the indexes this file relies on, once per server process. */
export function ensureNotificationIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      await Promise.all([
        // Unique only among rows that have a token, so rows written by other code without one never collide.
        db.collection(DEVICE_COLLECTION).createIndex({ token: 1 }, { unique: true, name: 'token_unique', partialFilterExpression: { token: { $type: 'string' } } }),
        db.collection(DEVICE_COLLECTION).createIndex({ phone: 1, app: 1, status: 1 }),
        db.collection(RECEIPT_COLLECTION).createIndex({ provider: 1, eventKey: 1 }, { unique: true }),
        db.collection(RECEIPT_COLLECTION).createIndex({ provider: 1, messageId: 1, matched: 1 }),
        db.collection(LOG_COLLECTION).createIndex({ provider: 1, providerMessageId: 1 }),
        db.collection(LOG_COLLECTION).createIndex({ campaignId: 1, createdAt: -1 }),
        db.collection(LOG_COLLECTION).createIndex({ status: 1, retryable: 1, nextRetryAt: 1 }),
      ]);
    })().catch((error) => {
      indexesReady = null;
      console.error('Creating notification indexes failed:', error);
    });
  }
  return indexesReady;
}

/* ------------------------------------------------------------------ */
/* Delivery log                                                        */
/* ------------------------------------------------------------------ */

/** Order of the lifecycle. A receipt never moves an entry back to an earlier stage. */
const STATUS_RANK: Record<string, number> = { not_sent: 0, queued: 0, accepted: 1, delivered: 2, failed: 2, read: 3 };

export interface DeliveryLogInput {
  channel: Channel;
  to: string;
  templateKey?: string | null;
  subject?: string | null;
  body?: string | null;
  status: SendStatus | 'queued';
  providerMessageId?: string | null;
  error?: string | null;
  campaignId?: string | null;
  /** "announcement", "push-campaign" or null for a single message. */
  campaignType?: string | null;
  attempt?: number;
  /** The log entry this one retries. */
  retryOf?: string | null;
  /** The first entry of a chain of retries. */
  rootLogId?: string | null;
  /** "otp" and "test" entries cannot be retried by an admin; "campaign" entries are summaries. */
  kind?: 'message' | 'otp' | 'campaign' | 'test';
  bulk?: boolean;
  emergency?: boolean;
  variables?: Record<string, string> | null;
  provider?: string | null;
  requestedBy?: string | null;
  recipient?: { type: string; id?: string | null; name?: string | null } | null;
  /** Free-text push sent without a template (push campaigns), kept so it can be retried. */
  direct?: { title: string; body: string; data?: Record<string, string> | null; approvedBy: string } | null;
}

function logDocument(entry: DeliveryLogInput, now: Date) {
  return {
    channel: entry.channel,
    to: entry.to,
    templateKey: entry.templateKey || null,
    subject: entry.subject || null,
    body: entry.body ? entry.body.slice(0, 4000) : null,
    status: entry.status,
    statusRank: STATUS_RANK[entry.status] ?? 0,
    statusAt: now,
    provider: entry.provider || null,
    providerMessageId: entry.providerMessageId || null,
    error: entry.error ? entry.error.slice(0, 500) : null,
    campaignId: entry.campaignId || null,
    campaignType: entry.campaignType || null,
    attempt: entry.attempt || 1,
    retryOf: entry.retryOf || null,
    rootLogId: entry.rootLogId || entry.retryOf || null,
    kind: entry.kind || 'message',
    bulk: entry.bulk === true,
    emergency: entry.emergency === true,
    variables: entry.variables || null,
    requestedBy: entry.requestedBy || null,
    recipient: entry.recipient || null,
    direct: entry.direct || null,
    retryable: false,
    nextRetryAt: null,
    events: [
      {
        status: entry.status,
        at: now,
        source: 'system',
        detail: entry.status === 'accepted' ? entry.providerMessageId || null : entry.error ? entry.error.slice(0, 300) : null,
      },
    ],
    ...(entry.status === 'accepted' ? { acceptedAt: now } : {}),
    ...(entry.status === 'failed' ? { failedAt: now } : {}),
    createdAt: now,
  };
}

/** Writes a finished entry (accepted, failed or not sent) in one step. */
export async function logDelivery(db: Db, entry: DeliveryLogInput): Promise<string> {
  const result = await db.collection(LOG_COLLECTION).insertOne(logDocument(entry, new Date()));
  return String(result.insertedId);
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Replaces {{name}} placeholders. Returns the placeholders that had no value. */
export function renderTemplate(source: string, variables: Record<string, any> = {}): { text: string; missing: string[] } {
  const missing: string[] = [];
  const rendered = String(source || '').replace(PLACEHOLDER, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === null || value === '') {
      if (!missing.includes(name)) missing.push(name);
      return '';
    }
    return String(value);
  });
  return { text: rendered, missing };
}

/** The placeholders used in a template body or subject, in order of first appearance. */
export function templateVariables(source: string): string[] {
  const names: string[] = [];
  String(source || '').replace(PLACEHOLDER, (_m, name: string) => {
    if (!names.includes(name)) names.push(name);
    return '';
  });
  return names;
}

/** Text that looks like a placeholder but is not one, e.g. "{{ first name }}" or an unclosed "{{". */
export function placeholderProblem(source: string): string | null {
  const textValue = String(source || '');
  const opened = (textValue.match(/\{\{/g) || []).length;
  const closed = (textValue.match(/\}\}/g) || []).length;
  if (opened !== closed) return 'Every {{ needs a matching }}';
  const bad = textValue.match(/\{\{(?!\s*[A-Za-z0-9_]+\s*\}\})[^}]*\}\}/);
  if (bad) return `"${bad[0]}" is not a valid placeholder: use letters, numbers and underscores only, e.g. {{name}}`;
  return null;
}

/** Every variable a template needs: subject first, then body, in order. */
export function variablesOfTemplate(template: { subject?: unknown; body?: unknown } | Record<string, any>): string[] {
  const t = template as { subject?: unknown; body?: unknown };
  const names = templateVariables(String(t.subject || ''));
  for (const name of templateVariables(String(t.body || ''))) if (!names.includes(name)) names.push(name);
  return names;
}

/** The template for a key and channel, preferring an approved one. */
export async function findTemplate(db: Db, key: string, channel: Channel) {
  const matches = await db.collection(TEMPLATE_COLLECTION).find({ key, channel }).toArray();
  return matches.find((t) => t.status === 'approved') || matches[0] || null;
}

/** Values every announcement gives its template. */
export const ANNOUNCEMENT_VARIABLES = ['title', 'message', 'name', 'city'];

/**
 * Every channel of an announcement must have an approved template that needs
 * no value the announcement cannot give. Returns the first problem, or null.
 */
export async function announcementTemplatesProblem(db: Db, record: Record<string, any>): Promise<string | null> {
  const channels = (Array.isArray(record.channels) ? record.channels : []).filter(isChannel);
  const key = String(record.templateKey || '');
  if (channels.length === 0) return 'Choose at least one channel';
  for (const channel of channels) {
    const template = await findTemplate(db, key, channel);
    if (!template) return `No ${channel} template has the key "${key}". Create it and have it approved first.`;
    if (template.status !== 'approved') {
      return `The ${channel} template "${key}" is ${String(template.status || 'draft').replace(/_/g, ' ')}, not approved. Announcements may only use approved templates.`;
    }
    const unknown = variablesOfTemplate(template).filter((name) => !ANNOUNCEMENT_VARIABLES.includes(name));
    if (unknown.length) {
      return `The ${channel} template "${key}" uses ${unknown.map((n) => `{{${n}}}`).join(', ')}, which an announcement cannot fill. Announcements give ${ANNOUNCEMENT_VARIABLES.map((n) => `{{${n}}}`).join(', ')}.`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Provider HTTP                                                        */
/* ------------------------------------------------------------------ */

const PROVIDER_TIMEOUT_MS = 10_000;

/** Removes every given secret from a text before it is stored or returned. */
function scrubAll(message: string, secrets: string[]): string {
  let out = String(message || '');
  for (const secret of secrets) if (secret && secret.length >= 4) out = out.split(secret).join('[key]');
  return out.slice(0, 500);
}

/** Removes the API key from any text before it is stored or returned. */
function scrub(message: string, secret: string): string {
  return scrubAll(message, [secret]).slice(0, 300);
}

interface HttpOutcome {
  status: number;
  json: any;
  text: string;
  headers: Headers;
}

async function providerFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  secrets: string[]
): Promise<HttpOutcome | { networkError: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const raw = await response.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text: raw.slice(0, 2000), headers: response.headers };
  } catch (error: any) {
    if (error?.name === 'AbortError') return { networkError: `the provider did not answer within ${PROVIDER_TIMEOUT_MS / 1000} seconds` };
    return { networkError: scrubAll('could not reach the provider: ' + (error?.cause?.code || error?.message || 'network error'), secrets) };
  } finally {
    clearTimeout(timer);
  }
}

/** Errors worth trying again later: timeouts, rate limits and server errors. */
function transientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

interface ProviderResult {
  ok: boolean;
  messageId?: string | null;
  error?: string | null;
  /** A temporary problem: the scheduler retries it with backoff. */
  transient?: boolean;
  /** Push only: the device token is no longer valid. */
  tokenInvalid?: boolean;
}

interface OutgoingMessage {
  to: string;
  subject: string;
  body: string;
  logId: string;
  /** WhatsApp only: the approved provider template and its body values in order. */
  whatsapp?: { name: string; language: string; parameters: string[] };
  /** Push only: extra key/value data delivered to the app. */
  data?: Record<string, string>;
}

type MessageAdapter = (config: ChannelConfig, message: OutgoingMessage) => Promise<ProviderResult>;

function networkFailure(outcome: { networkError: string }): ProviderResult {
  return { ok: false, error: outcome.networkError, transient: true };
}

/* ---------- SendGrid ---------- */

const sendgridAdapter: MessageAdapter = async (config, message) => {
  const from: Record<string, string> = { email: config.values.fromAddress };
  if (config.values.fromName) from.name = config.values.fromName;
  const outcome = await providerFetch(
    `${providerBase('sendgrid')}/v3/mail/send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }], custom_args: { mookalaa_log_id: message.logId } }],
        from,
        subject: message.subject,
        content: [{ type: 'text/plain', value: message.body }],
      }),
    },
    [config.secret]
  );
  if ('networkError' in outcome) return networkFailure(outcome);
  if (outcome.status === 202 || outcome.status === 200) {
    const id = outcome.headers.get('x-message-id');
    return { ok: true, messageId: id || null };
  }
  const reasons = Array.isArray(outcome.json?.errors)
    ? outcome.json.errors.map((e: any) => [e?.message, e?.field ? `(${e.field})` : ''].filter(Boolean).join(' ')).join('; ')
    : '';
  return {
    ok: false,
    error: scrub(`SendGrid HTTP ${outcome.status}: ${reasons || outcome.text || 'no reason given'}`, config.secret),
    transient: transientStatus(outcome.status),
  };
};

/* ---------- Resend ---------- */

const resendAdapter: MessageAdapter = async (config, message) => {
  const fromAddress = config.values.fromAddress;
  const from = config.values.fromName ? `${config.values.fromName.replace(/[<>"]/g, '')} <${fromAddress}>` : fromAddress;
  const outcome = await providerFetch(
    `${providerBase('resend')}/emails`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.secret}`,
        'Content-Type': 'application/json',
        // The same log entry is never sent twice, even if a request is repeated.
        'Idempotency-Key': `mookalaa-${message.logId}`,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.body,
        tags: [{ name: 'mookalaa_log_id', value: message.logId }],
      }),
    },
    [config.secret]
  );
  if ('networkError' in outcome) return networkFailure(outcome);
  if (outcome.status >= 200 && outcome.status < 300 && typeof outcome.json?.id === 'string') {
    return { ok: true, messageId: outcome.json.id };
  }
  const reason = [outcome.json?.name, outcome.json?.message].filter(Boolean).join(': ');
  return {
    ok: false,
    error: scrub(`Resend HTTP ${outcome.status}: ${reason || outcome.text || 'no reason given'}`, config.secret),
    transient: transientStatus(outcome.status),
  };
};

/* ---------- Meta WhatsApp Cloud API ---------- */

/** WhatsApp wants the number with its country code and no "+". Ten-digit numbers are Indian. */
export function whatsappNumber(phone: string): string | null {
  const digits = String(phone || '').replace(/[\s\-()+]/g, '');
  if (!/^\d{10,15}$/.test(digits)) return null;
  return digits.length === 10 ? '91' + digits : digits;
}

/** Meta error codes that mean "try again later" (rate limits, temporary outages). */
const META_TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 613, 80007, 130429, 131016, 131048, 131056]);

const metaAdapter: MessageAdapter = async (config, message) => {
  const to = whatsappNumber(message.to);
  if (!to) return { ok: false, error: 'The recipient phone number is not valid for WhatsApp' };
  if (!message.whatsapp) return { ok: false, error: 'No WhatsApp template was given' };
  const version = config.values.apiVersion || 'v22.0';
  const template: Record<string, any> = { name: message.whatsapp.name, language: { code: message.whatsapp.language } };
  if (message.whatsapp.parameters.length) {
    template.components = [{ type: 'body', parameters: message.whatsapp.parameters.map((value) => ({ type: 'text', text: value })) }];
  }
  const outcome = await providerFetch(
    `${providerBase('meta')}/${version}/${encodeURIComponent(config.values.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template }),
    },
    [config.secret]
  );
  if ('networkError' in outcome) return networkFailure(outcome);
  const id = outcome.json?.messages?.[0]?.id;
  if (outcome.status >= 200 && outcome.status < 300 && typeof id === 'string') return { ok: true, messageId: id };
  const err = outcome.json?.error || {};
  const details = err?.error_data?.details ? ` (${err.error_data.details})` : '';
  const reason = err.message ? `${err.message}${err.code ? ` [code ${err.code}]` : ''}${details}` : outcome.text || 'no reason given';
  return {
    ok: false,
    error: scrub(`WhatsApp HTTP ${outcome.status}: ${reason}`, config.secret),
    transient: transientStatus(outcome.status) || META_TRANSIENT_CODES.has(Number(err.code)),
  };
};

/* ---------- Firebase Cloud Messaging HTTP v1 ---------- */

const accessTokens = new Map<string, { token: string; expiresAt: number }>();

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** A JWT signed with the service account's private key (RS256), as Google's OAuth expects. */
function serviceAccountJwt(account: ServiceAccount, nowSeconds: number): string {
  const header: Record<string, string> = { alg: 'RS256', typ: 'JWT' };
  if (account.privateKeyId) header.kid = account.privateKeyId;
  const claims = { iss: account.clientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_AUDIENCE, iat: nowSeconds, exp: nowSeconds + 3600 };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.privateKey);
  return `${unsigned}.${base64url(signature)}`;
}

/** An OAuth access token for FCM, cached until a minute before it expires. */
async function fcmAccessToken(account: ServiceAccount, forceNew = false): Promise<{ token: string } | { error: string; transient: boolean }> {
  const url = fcmTokenUrl();
  const cacheKey = `${account.clientEmail}|${account.privateKeyId}|${url}`;
  const cached = accessTokens.get(cacheKey);
  if (!forceNew && cached && cached.expiresAt > Date.now()) return { token: cached.token };

  const assertion = serviceAccountJwt(account, Math.floor(Date.now() / 1000));
  const outcome = await providerFetch(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    },
    [assertion]
  );
  if ('networkError' in outcome) return { error: `Google sign-in for FCM failed: ${outcome.networkError}`, transient: true };
  const token = outcome.json?.access_token;
  if (outcome.status === 200 && typeof token === 'string') {
    const lifetime = Number(outcome.json?.expires_in) || 3600;
    accessTokens.set(cacheKey, { token, expiresAt: Date.now() + Math.max(60, lifetime - 60) * 1000 });
    return { token };
  }
  const reason = [outcome.json?.error, outcome.json?.error_description].filter(Boolean).join(': ') || outcome.text || 'no reason given';
  return { error: `Google refused the service account (HTTP ${outcome.status}): ${reason}`.slice(0, 400), transient: transientStatus(outcome.status) };
}

const fcmAdapter: MessageAdapter = async (config, message) => {
  const account = parseServiceAccount(config.secret);
  if (typeof account === 'string') return { ok: false, error: `The saved service account is not usable: ${account}` };

  const send = async (forceNewToken: boolean): Promise<ProviderResult & { unauthenticated?: boolean }> => {
    const auth = await fcmAccessToken(account, forceNewToken);
    if ('error' in auth) return { ok: false, error: auth.error, transient: auth.transient };
    const notification: Record<string, string> = { body: message.body };
    if (message.subject) notification.title = message.subject;
    const payload: Record<string, any> = { token: message.to, notification };
    if (message.data && Object.keys(message.data).length) payload.data = message.data;
    const outcome = await providerFetch(
      `${providerBase('fcm')}/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: payload }),
      },
      [auth.token]
    );
    if ('networkError' in outcome) return networkFailure(outcome);
    if (outcome.status === 200 && typeof outcome.json?.name === 'string') return { ok: true, messageId: outcome.json.name };

    const err = outcome.json?.error || {};
    const fcmCode: string =
      (Array.isArray(err.details) && err.details.find((d: any) => typeof d?.errorCode === 'string')?.errorCode) || err.status || '';
    const reason = `FCM HTTP ${outcome.status}: ${err.message || outcome.text || 'no reason given'}${fcmCode ? ` [${fcmCode}]` : ''}`;
    const tokenInvalid =
      fcmCode === 'UNREGISTERED' || (fcmCode === 'INVALID_ARGUMENT' && /registration token/i.test(String(err.message || '')));
    return {
      ok: false,
      error: reason.slice(0, 400),
      tokenInvalid,
      unauthenticated: outcome.status === 401,
      transient: !tokenInvalid && (transientStatus(outcome.status) || ['UNAVAILABLE', 'INTERNAL', 'QUOTA_EXCEEDED'].includes(fcmCode)),
    };
  };

  const first = await send(false);
  // A cached access token that Google no longer accepts: get a new one and try once more.
  if (first.unauthenticated) return send(true);
  return first;
};

/**
 * Adapters for templated messages, by provider. SMS text through 2Factor is
 * deliberately absent (see the header of this file).
 */
const MESSAGE_ADAPTERS: Partial<Record<string, MessageAdapter>> = {
  sendgrid: sendgridAdapter,
  resend: resendAdapter,
  meta: metaAdapter,
  fcm: fcmAdapter,
};

/** Why a channel cannot send a templated message right now, or null when it can. */
export function messageBlocker(config: ChannelConfig): string | null {
  const label = SPEC[config.channel].label;
  if (config.channel === 'sms') {
    return 'SMS text messages are not implemented: 2Factor is connected for one-time passwords only';
  }
  if (config.channel === 'email' && !config.provider) return 'email provider not connected: choose SendGrid or Resend';
  if (!hasMessageAdapter(config)) return `${config.channel} provider not connected`;
  const problem = configurationProblem(config);
  if (problem) return `${label} provider not connected: ${problem}`;
  if (!config.enabled) return `${label} channel is switched off`;
  return null;
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
  emergency?: boolean;
  attempt?: number;
  retryOf?: string | null;
  rootLogId?: string | null;
  requestedBy?: string | null;
  recipient?: { type: string; id?: string | null; name?: string | null } | null;
  /** Push only: key/value data for the app. */
  data?: Record<string, string> | null;
}

export interface SendResult {
  status: SendStatus;
  logId: string;
  error: string | null;
  providerMessageId: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_:\-.]{20,4096}$/;

/** Why `to` cannot be used on the channel, or null. */
function addressProblem(channel: Channel, to: string): string | null {
  if (!to) return 'The recipient has no address for this channel';
  if (channel === 'email' && !EMAIL_PATTERN.test(to)) return 'The recipient email address is not valid';
  if ((channel === 'sms' || channel === 'whatsapp') && !whatsappNumber(to)) return 'The recipient phone number is not valid';
  if (channel === 'push' && !DEVICE_TOKEN_PATTERN.test(to)) return 'The device token is not valid';
  return null;
}

function backoffDate(attempt: number, now: Date): Date | null {
  if (attempt >= MAX_AUTO_ATTEMPTS) return null;
  const minutes = RETRY_BACKOFF_MINUTES[attempt - 1] ?? RETRY_BACKOFF_MINUTES[RETRY_BACKOFF_MINUTES.length - 1];
  return new Date(now.getTime() + minutes * 60_000);
}

/**
 * Queues one prepared message, hands it to the adapter and records the
 * outcome on the same log entry: queued -> accepted or failed.
 */
async function deliver(
  db: Db,
  base: DeliveryLogInput,
  config: ChannelConfig,
  adapter: MessageAdapter,
  message: Omit<OutgoingMessage, 'logId'>
): Promise<SendResult> {
  await ensureNotificationIndexes(db);
  const logs = db.collection(LOG_COLLECTION);
  const id = new ObjectId();
  const queuedAt = new Date();
  await logs.insertOne({ _id: id, ...logDocument({ ...base, status: 'queued', provider: config.provider }, queuedAt) });

  let outcome: ProviderResult;
  try {
    outcome = await adapter(config, { ...message, logId: String(id) });
  } catch (error: any) {
    outcome = { ok: false, error: scrubAll(error?.message || 'Provider request failed', Object.values(config.secrets)), transient: true };
  }

  const now = new Date();
  const attempt = base.attempt || 1;
  const error = outcome.ok ? null : scrubAll(outcome.error || 'The provider refused the message', Object.values(config.secrets));
  const nextRetryAt = !outcome.ok && outcome.transient ? backoffDate(attempt, now) : null;
  await logs.updateOne(
    { _id: id },
    {
      $set: outcome.ok
        ? { status: 'accepted', statusRank: 1, statusAt: now, acceptedAt: now, providerMessageId: outcome.messageId || null, error: null }
        : {
            status: 'failed',
            statusRank: 2,
            statusAt: now,
            failedAt: now,
            error,
            retryable: Boolean(outcome.transient),
            nextRetryAt,
            ...(outcome.tokenInvalid ? { deviceTokenInvalid: true } : {}),
          },
      $push: {
        events: {
          status: outcome.ok ? 'accepted' : 'failed',
          at: now,
          source: 'provider',
          detail: outcome.ok
            ? outcome.messageId
              ? `Provider reference ${outcome.messageId}`
              : 'Accepted without a provider reference: delivery receipts cannot be matched'
            : `${error}${outcome.transient ? (nextRetryAt ? ' (temporary: automatic retry scheduled)' : ' (temporary: no automatic attempts left)') : ''}`,
        },
      } as any,
    }
  );

  if (outcome.tokenInvalid && base.channel === 'push') await markDeviceTokenInvalid(db, base.to, error || 'Reported unregistered by FCM');
  if (outcome.ok && outcome.messageId) await reconcileReceipts(db, config.provider, outcome.messageId);

  return { status: outcome.ok ? 'accepted' : 'failed', logId: String(id), error, providerMessageId: outcome.ok ? outcome.messageId || null : null };
}

/**
 * Renders a template and hands it to the channel's provider. Always writes
 * one delivery log entry and never reports success unless the provider
 * accepted the message.
 */
export async function sendNotification(db: Db, input: SendInput): Promise<SendResult> {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.variables || {})) {
    if (value !== undefined && value !== null) variables[key] = String(value).slice(0, 2000);
  }

  const base: DeliveryLogInput = {
    channel: input.channel,
    to: String(input.to || '').trim().slice(0, 4096),
    templateKey: input.templateKey,
    status: 'not_sent',
    campaignId: input.campaignId || null,
    campaignType: input.campaignType || null,
    attempt: input.attempt || 1,
    retryOf: input.retryOf || null,
    rootLogId: input.rootLogId || null,
    bulk: input.bulk === true || input.emergency === true,
    emergency: input.emergency === true,
    variables,
    requestedBy: input.requestedBy || null,
    recipient: input.recipient || null,
  };

  const notSent = async (entry: Partial<DeliveryLogInput>): Promise<SendResult> => {
    const merged = { ...base, ...entry, status: 'not_sent' as const };
    const logId = await logDelivery(db, merged);
    return { status: 'not_sent', logId, error: merged.error || null, providerMessageId: null };
  };

  const template = await findTemplate(db, input.templateKey, input.channel);
  if (!template) return notSent({ error: `No ${input.channel} template with the key "${input.templateKey}" exists` });
  if (template.status === 'retired') return notSent({ error: `Template "${input.templateKey}" is retired` });
  // Enforced here, whoever calls: bulk and emergency messages only with an approved template.
  if (base.bulk && template.status !== 'approved') {
    return notSent({
      error: `Template "${input.templateKey}" is not approved: bulk and emergency messages may only use approved templates`,
    });
  }

  const subject = renderTemplate(template.subject || '', variables);
  const body = renderTemplate(template.body || '', variables);
  const rendered = { subject: subject.text, body: body.text };
  const missing = Array.from(new Set([...subject.missing, ...body.missing]));
  if (missing.length) return notSent({ ...rendered, error: `Missing values for template variables: ${missing.join(', ')}` });

  const config = await getChannelConfig(db, input.channel);
  const blocker = messageBlocker(config);
  const adapter = config.provider ? MESSAGE_ADAPTERS[config.provider] : undefined;
  if (blocker || !adapter) return notSent({ ...rendered, provider: config.provider || null, error: blocker || `${input.channel} provider not connected` });

  const problem = addressProblem(input.channel, base.to);
  if (problem) return notSent({ ...rendered, provider: config.provider, error: problem });

  let whatsapp: OutgoingMessage['whatsapp'];
  if (input.channel === 'email' && !rendered.subject.trim()) {
    return notSent({ ...rendered, provider: config.provider, error: `Email template "${input.templateKey}" has no subject` });
  }
  if (input.channel === 'whatsapp') {
    const name = text(template.whatsappTemplateName, 512);
    if (!name) {
      return notSent({ ...rendered, provider: config.provider, error: `WhatsApp template "${input.templateKey}" has no provider template name` });
    }
    whatsapp = {
      name,
      language: text(template.whatsappLanguage, 15) || text(template.language, 15) || 'en',
      parameters: templateVariables(template.body || '').map((key) => variables[key]),
    };
  }
  if (input.channel === 'push') {
    const device = await db.collection(DEVICE_COLLECTION).findOne({ token: base.to }, { projection: { status: 1 } });
    if (device?.status === 'invalid') {
      return notSent({ ...rendered, provider: config.provider, error: 'This device token was reported unregistered by FCM' });
    }
  }

  return deliver(db, { ...base, ...rendered }, config, adapter, {
    to: base.to,
    subject: rendered.subject,
    body: rendered.body,
    whatsapp,
    data: input.channel === 'push' ? { ...(input.data || {}), ...(input.campaignId ? { campaignId: input.campaignId } : {}) } : undefined,
  });
}

export interface PushMessageInput {
  /** The device token. */
  to: string;
  title: string;
  body: string;
  data?: Record<string, string> | null;
  campaignId?: string | null;
  campaignType?: string | null;
  /** Free text without a template is only allowed for content an admin approved (e.g. an approved push campaign). */
  approvedBy: string;
  requestedBy?: string | null;
  recipient?: { type: string; id?: string | null; name?: string | null } | null;
  attempt?: number;
  retryOf?: string | null;
  rootLogId?: string | null;
}

/**
 * Sends one free-text push notification (no template) to one device token.
 * Only for content that went through its own approval, such as a push
 * campaign: `approvedBy` must name the approver. Writes one log entry.
 */
export async function sendPushMessage(db: Db, input: PushMessageInput): Promise<SendResult> {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.data || {})) data[String(key).slice(0, 60)] = String(value ?? '').slice(0, 500);
  const base: DeliveryLogInput = {
    channel: 'push',
    to: String(input.to || '').trim().slice(0, 4096),
    templateKey: null,
    subject: String(input.title || '').slice(0, 200),
    body: String(input.body || '').slice(0, 2000),
    status: 'not_sent',
    campaignId: input.campaignId || null,
    campaignType: input.campaignType || null,
    attempt: input.attempt || 1,
    retryOf: input.retryOf || null,
    rootLogId: input.rootLogId || null,
    bulk: true,
    requestedBy: input.requestedBy || null,
    recipient: input.recipient || null,
    direct: { title: String(input.title || '').slice(0, 200), body: String(input.body || '').slice(0, 2000), data, approvedBy: String(input.approvedBy || '') },
  };
  const notSent = async (error: string, provider: string | null = null) => {
    const logId = await logDelivery(db, { ...base, error, provider });
    return { status: 'not_sent' as const, logId, error, providerMessageId: null };
  };

  if (!String(input.approvedBy || '').trim()) return notSent('Free-text push needs approved content: no approver was given');
  if (!base.body) return notSent('The push message has no text');
  const config = await getChannelConfig(db, 'push');
  const blocker = messageBlocker(config);
  const adapter = MESSAGE_ADAPTERS[config.provider];
  if (blocker || !adapter) return notSent(blocker || 'push provider not connected', config.provider || null);
  const problem = addressProblem('push', base.to);
  if (problem) return notSent(problem, config.provider);
  const device = await db.collection(DEVICE_COLLECTION).findOne({ token: base.to }, { projection: { status: 1 } });
  if (device?.status === 'invalid') return notSent('This device token was reported unregistered by FCM', config.provider);

  return deliver(db, base, config, adapter, { to: base.to, subject: base.subject || '', body: base.body || '', data });
}

/**
 * A test message to an address an admin typed, with fixed wording. Logged as
 * kind "test" (never retried). Works while the channel is switched off, so a
 * provider can be checked before it is switched on.
 */
export async function sendTestMessage(
  db: Db,
  channel: Channel,
  input: { to: string; whatsappTemplate?: string; whatsappLanguage?: string },
  requestedBy: string | null
): Promise<SendResult> {
  const config = await getChannelConfig(db, channel);
  const to = String(input.to || '').trim().slice(0, 4096);
  const subject = channel === 'push' ? 'Mookalaa test notification' : 'Mookalaa test message';
  const noun: Record<Channel, string> = { sms: 'SMS', email: 'email', whatsapp: 'WhatsApp message', push: 'push notification' };
  const body = `This is a test ${noun[channel]} sent from the Mookalaa admin panel by ${requestedBy || 'an admin'} at ${new Date().toISOString()}.`;
  const base: DeliveryLogInput = { channel, to, templateKey: null, subject, body, status: 'not_sent', kind: 'test', requestedBy };
  const notSent = async (error: string) => {
    const logId = await logDelivery(db, { ...base, error, provider: config.provider || null });
    return { status: 'not_sent' as const, logId, error, providerMessageId: null };
  };

  const adapter = config.provider ? MESSAGE_ADAPTERS[config.provider] : undefined;
  if (channel === 'sms' || !adapter) return notSent(messageBlocker(config) || `${channel} provider not connected`);
  const problem = configurationProblem(config);
  if (problem) return notSent(`${SPEC[channel].label} provider not connected: ${problem}`);
  const addressIssue = addressProblem(channel, to);
  if (addressIssue) return notSent(addressIssue);

  let whatsapp: OutgoingMessage['whatsapp'];
  if (channel === 'whatsapp') {
    const name = text(input.whatsappTemplate, 512) || 'hello_world';
    const language = text(input.whatsappLanguage, 15) || 'en_US';
    if (!/^[a-z0-9_]{1,512}$/.test(name)) return notSent('The WhatsApp template name may only contain lower-case letters, numbers and underscores');
    if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) return notSent('The WhatsApp language code looks like en or en_US');
    whatsapp = { name, language, parameters: [] };
    base.subject = null;
    base.body = `WhatsApp template "${name}" (${language}) with no variables`;
  }

  return deliver(db, base, config, adapter, {
    to,
    subject,
    body: base.body || body,
    whatsapp,
    data: channel === 'push' ? { type: 'test' } : undefined,
  });
}

/* ------------------------------------------------------------------ */
/* Retries                                                             */
/* ------------------------------------------------------------------ */

const RETRYABLE_STATUSES = ['failed', 'not_sent'];

/**
 * Retry of a failed or unsent log entry, by an admin or by the scheduler.
 * The original entry is kept and marked as retried; the new attempt is a new
 * entry with the next attempt number.
 */
export async function retryDelivery(
  db: Db,
  logId: string,
  requestedBy: string | null,
  options: { automatic?: boolean } = {}
): Promise<{ ok: false; error: string; status: number } | { ok: true; result: SendResult }> {
  if (!ObjectId.isValid(logId) || logId.length !== 24) return { ok: false, error: 'Invalid log entry id', status: 400 };
  const logs = db.collection(LOG_COLLECTION);
  const entry = await logs.findOne({ _id: new ObjectId(logId) });
  if (!entry) return { ok: false, error: 'Log entry not found', status: 404 };
  if (!RETRYABLE_STATUSES.includes(entry.status)) {
    return {
      ok: false,
      error: entry.status === 'queued' ? 'This message is still being sent' : 'The provider accepted this message: it cannot be retried',
      status: 409,
    };
  }
  if (entry.kind === 'otp') {
    return { ok: false, error: 'One-time passwords are not retried from here: the person signing in requests a new one', status: 409 };
  }
  if (entry.kind === 'test') return { ok: false, error: 'Test messages are not retried: send a new test from Channels & Providers', status: 409 };
  if (entry.kind === 'campaign' || !isChannel(entry.channel) || (!entry.templateKey && !entry.direct)) {
    return { ok: false, error: 'This entry is a campaign summary: send the campaign again from its own screen', status: 409 };
  }
  if (entry.retryLogId) return { ok: false, error: 'This entry has already been retried', status: 409 };
  if (entry.deviceTokenInvalid) return { ok: false, error: 'FCM reported this device token unregistered: it cannot be retried', status: 409 };
  if (entry.channel === 'push' && !DEVICE_TOKEN_PATTERN.test(String(entry.to || ''))) {
    return { ok: false, error: 'This account had no registered device: there is nothing to retry', status: 409 };
  }

  // Claim the entry so an admin and the scheduler cannot retry it at the same moment.
  const now = new Date();
  const claimed = await logs.updateOne(
    {
      _id: entry._id,
      retryLogId: null,
      $or: [{ retryClaimedAt: { $exists: false } }, { retryClaimedAt: null }, { retryClaimedAt: { $lt: new Date(now.getTime() - 120_000) } }],
    },
    { $set: { retryClaimedAt: now, retryClaimedBy: requestedBy } }
  );
  if (claimed.modifiedCount !== 1) return { ok: false, error: 'This entry is already being retried', status: 409 };

  const common = {
    campaignId: entry.campaignId,
    campaignType: entry.campaignType,
    attempt: (entry.attempt || 1) + 1,
    retryOf: logId,
    rootLogId: entry.rootLogId || logId,
    requestedBy,
    recipient: entry.recipient || null,
  };
  const result = entry.direct
    ? await sendPushMessage(db, {
        to: entry.to,
        title: entry.direct.title,
        body: entry.direct.body,
        data: entry.direct.data || null,
        approvedBy: entry.direct.approvedBy,
        ...common,
      })
    : await sendNotification(db, {
        channel: entry.channel,
        to: entry.to,
        templateKey: entry.templateKey,
        variables: entry.variables || {},
        bulk: entry.bulk === true,
        emergency: entry.emergency === true,
        ...common,
      });

  await logs.updateOne(
    { _id: entry._id },
    {
      $set: {
        retryLogId: result.logId,
        retriedAt: new Date(),
        retriedBy: requestedBy,
        retryMode: options.automatic ? 'automatic' : 'manual',
        nextRetryAt: null,
      },
      $push: {
        events: {
          status: 'retried',
          at: new Date(),
          source: options.automatic ? 'scheduler' : 'admin',
          detail: `Attempt ${common.attempt} (${result.status.replace('_', ' ')}) by ${requestedBy || 'unknown'}`,
          retryLogId: result.logId,
        },
      } as any,
    }
  );

  return { ok: true, result };
}

/**
 * Automatic retries: failed entries whose provider error was temporary, whose
 * backoff time has passed and that have attempts left.
 */
export async function retryDueDeliveries(
  db: Db,
  now: Date,
  options: { limit?: number; deadline?: number } = {}
): Promise<{ attempted: number; accepted: number; failed: number; notSent: number; skipped: number }> {
  const due = await db
    .collection(LOG_COLLECTION)
    .find({
      status: 'failed',
      retryable: true,
      retryLogId: null,
      attempt: { $lt: MAX_AUTO_ATTEMPTS },
      nextRetryAt: { $lte: now },
    })
    .sort({ nextRetryAt: 1 })
    .limit(options.limit || 100)
    .project({ _id: 1 })
    .toArray();
  const tally = { attempted: 0, accepted: 0, failed: 0, notSent: 0, skipped: 0 };
  for (const item of due) {
    if (options.deadline && Date.now() > options.deadline) break;
    const outcome = await retryDelivery(db, String(item._id), 'scheduler', { automatic: true });
    if (!outcome.ok) {
      tally.skipped += 1;
      continue;
    }
    tally.attempted += 1;
    if (outcome.result.status === 'accepted') tally.accepted += 1;
    else if (outcome.result.status === 'failed') tally.failed += 1;
    else tally.notSent += 1;
  }
  return tally;
}

/* ------------------------------------------------------------------ */
/* Delivery receipts (provider webhooks)                               */
/* ------------------------------------------------------------------ */

export type ReceiptProvider = 'sendgrid' | 'resend' | 'meta';

export interface ProviderReceipt {
  provider: ReceiptProvider;
  /** The provider's message id, as stored on the log entry. */
  messageId: string;
  /** The provider's own event name, e.g. "delivered", "bounce", "email.opened". */
  event: string;
  /** Lifecycle status it moves the entry to, or null for an event that is only recorded. */
  status: 'accepted' | 'delivered' | 'read' | 'failed' | null;
  at: Date;
  /** Unique per event at the provider: a repeat is recognised and ignored. */
  eventKey: string;
  detail?: string | null;
}

async function applyToLog(db: Db, logId: ObjectId, receipt: ProviderReceipt): Promise<void> {
  const logs = db.collection(LOG_COLLECTION);
  const now = new Date();
  const timestamps: Record<string, Date> = {};
  if (receipt.status === 'delivered') timestamps.deliveredAt = receipt.at;
  if (receipt.status === 'read') timestamps.readAt = receipt.at;
  await logs.updateOne(
    { _id: logId },
    {
      $set: { lastReceiptAt: now, providerStatus: receipt.event, ...timestamps },
      $push: {
        events: {
          status: receipt.status || receipt.event,
          providerEvent: receipt.event,
          at: receipt.at,
          receivedAt: now,
          source: 'webhook',
          detail: receipt.detail || null,
          key: receipt.eventKey,
        },
      } as any,
    }
  );
  if (!receipt.status) return;
  const rank = STATUS_RANK[receipt.status];
  // Only forward in the lifecycle; between "delivered" and "failed" the later event wins.
  await logs.updateOne(
    { _id: logId, $or: [{ statusRank: { $lt: rank } }, { statusRank: rank, statusAt: { $lte: receipt.at } }] },
    {
      $set: {
        status: receipt.status,
        statusRank: rank,
        statusAt: receipt.at,
        ...(receipt.status === 'failed'
          ? { failedAt: receipt.at, error: (receipt.detail || `The provider reported "${receipt.event}"`).slice(0, 500), retryable: false, nextRetryAt: null }
          : {}),
      },
    }
  );
}

/**
 * Records provider status events and applies each to the log entry with the
 * same provider message id. Repeats of an event are ignored (idempotent).
 * Events for a message whose id is not stored yet are kept and applied as
 * soon as the send finishes.
 */
export async function applyReceipts(db: Db, receipts: ProviderReceipt[]): Promise<{ applied: number; duplicates: number; unmatched: number }> {
  await ensureNotificationIndexes(db);
  const store = db.collection(RECEIPT_COLLECTION);
  const logs = db.collection(LOG_COLLECTION);
  const tally = { applied: 0, duplicates: 0, unmatched: 0 };
  for (const receipt of receipts) {
    if (!receipt.messageId || !receipt.eventKey) continue;
    if (await store.findOne({ provider: receipt.provider, eventKey: receipt.eventKey.slice(0, 300) }, { projection: { _id: 1 } })) {
      tally.duplicates += 1;
      continue;
    }
    try {
      await store.insertOne({
        provider: receipt.provider,
        eventKey: receipt.eventKey.slice(0, 300),
        messageId: receipt.messageId.slice(0, 300),
        event: receipt.event.slice(0, 60),
        status: receipt.status,
        at: receipt.at,
        detail: receipt.detail ? receipt.detail.slice(0, 500) : null,
        matched: false,
        logId: null,
        receivedAt: new Date(),
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        tally.duplicates += 1;
        continue;
      }
      throw error;
    }
    const log = await logs.findOne({ provider: receipt.provider, providerMessageId: receipt.messageId }, { projection: { _id: 1 } });
    if (!log) {
      tally.unmatched += 1;
      continue;
    }
    await applyToLog(db, log._id, receipt);
    await store.updateOne({ provider: receipt.provider, eventKey: receipt.eventKey.slice(0, 300) }, { $set: { matched: true, logId: String(log._id) } });
    tally.applied += 1;
  }
  return tally;
}

/** Applies receipts that arrived before the send recorded its provider message id. */
async function reconcileReceipts(db: Db, provider: string, messageId: string): Promise<void> {
  if (!['sendgrid', 'resend', 'meta'].includes(provider)) return;
  const store = db.collection(RECEIPT_COLLECTION);
  const waiting = await store.find({ provider, messageId, matched: false }).sort({ at: 1 }).limit(50).toArray();
  if (waiting.length === 0) return;
  const log = await db.collection(LOG_COLLECTION).findOne({ provider, providerMessageId: messageId }, { projection: { _id: 1 } });
  if (!log) return;
  for (const item of waiting) {
    await applyToLog(db, log._id, {
      provider: item.provider,
      messageId: item.messageId,
      event: item.event,
      status: item.status,
      at: item.at,
      eventKey: item.eventKey,
      detail: item.detail,
    });
    await store.updateOne({ _id: item._id }, { $set: { matched: true, logId: String(log._id) } });
  }
}

/* ---------- webhook signature checks ---------- */

function sameText(a: string, b: string): boolean {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

/** SendGrid signed event webhook: ECDSA P-256 / SHA-256 over timestamp + raw body. */
export function verifySendgridSignature(publicKeyBase64: string, signatureBase64: string, timestamp: string, rawBody: string): boolean {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyBase64, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify('sha256', Buffer.from(timestamp + rawBody), key, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

/** The shared secret given as ?key= on the SendGrid webhook URL. */
export function verifySharedSecret(expected: string, given: string | null): boolean {
  return Boolean(expected && given && sameText(expected, given));
}

/** Svix signatures as Resend sends them. Rejects timestamps more than 5 minutes away. */
export function verifySvixSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  now: Date = new Date()
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const seconds = Number(headers.timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now.getTime() / 1000 - seconds) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest('base64');
  return headers.signature
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .some((part) => sameText(part.slice(3), expected));
}

/** Meta's X-Hub-Signature-256: "sha256=" + hex HMAC of the raw body with the app secret. */
export function verifyMetaSignature(appSecret: string, header: string | null, rawBody: string): boolean {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return sameText(header, expected);
}

export { sameText as secretsMatch };

/* ------------------------------------------------------------------ */
/* Device tokens (push)                                                */
/* ------------------------------------------------------------------ */

export type DeviceApp = 'user' | 'organizer';
export type DevicePlatform = 'android' | 'ios' | 'web';
const MAX_TOKENS_PER_PHONE = 10;

export function isDeviceToken(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_TOKEN_PATTERN.test(value);
}

/** Saves (or moves to this phone) a device token. Keeps at most 10 tokens per phone and app. */
export async function registerDeviceToken(
  db: Db,
  input: { phone: string; token: string; platform: DevicePlatform; app: DeviceApp }
): Promise<{ created: boolean }> {
  await ensureNotificationIndexes(db);
  const tokens = db.collection(DEVICE_COLLECTION);
  const now = new Date();
  const result = await tokens.updateOne(
    { token: input.token },
    {
      $set: {
        phone: input.phone,
        platform: input.platform,
        app: input.app,
        status: 'valid',
        invalidReason: null,
        invalidAt: null,
        lastSeenAt: now,
        updatedAt: now,
      },
      $setOnInsert: { token: input.token, createdAt: now },
    },
    { upsert: true }
  );
  const extra = await tokens
    .find({ phone: input.phone, app: input.app })
    .sort({ lastSeenAt: -1 })
    .skip(MAX_TOKENS_PER_PHONE)
    .project({ _id: 1 })
    .toArray();
  if (extra.length) await tokens.deleteMany({ _id: { $in: extra.map((item) => item._id) } });
  return { created: Boolean(result.upsertedCount) };
}

export async function removeDeviceToken(db: Db, input: { phone: string; token: string }): Promise<number> {
  const result = await db.collection(DEVICE_COLLECTION).deleteOne({ phone: input.phone, token: input.token });
  return result.deletedCount;
}

/** Marks a token FCM reported as unregistered: it is never used again until the app registers it anew. */
export async function markDeviceTokenInvalid(db: Db, token: string, reason: string): Promise<void> {
  await db
    .collection(DEVICE_COLLECTION)
    .updateOne({ token }, { $set: { status: 'invalid', invalidReason: String(reason || '').slice(0, 300), invalidAt: new Date(), updatedAt: new Date() } });
}

/** Valid device tokens for each phone, for one app (or both when app is null). */
export async function validTokensFor(db: Db, phones: string[], app: DeviceApp | null): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const list = Array.from(new Set(phones.filter(Boolean)));
  if (list.length === 0) return out;
  const rows = await db
    .collection(DEVICE_COLLECTION)
    .find({ phone: { $in: list }, status: 'valid', ...(app ? { app } : {}) })
    .project({ phone: 1, token: 1 })
    .toArray();
  for (const row of rows) {
    const items = out.get(row.phone) || [];
    items.push(row.token);
    out.set(row.phone, items);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 2Factor OTP SMS                                                     */
/* ------------------------------------------------------------------ */

/** TWOFACTOR_BASE_URL exists so tests can point at a local stub instead of sending a real SMS. */
function twoFactorBase(): string {
  return providerBase('2factor');
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
  /** The app the accounts use, for push tokens: customers use the user app, artists and organisers the organiser app. */
  app: DeviceApp;
}

export interface AudienceFilters {
  /** Exact city, any letter case. */
  city?: string | null;
  /** Customers only: an event id or the event's exact name. */
  event?: string | null;
  /** With `event`: only customers who were checked in, not everyone who booked. */
  attendedOnly?: boolean;
  /** Customers only. */
  membership?: 'active' | 'expired' | 'none' | null;
}

const NOT_RESTRICTED = { accountStatus: { $nin: ['suspended', 'blocked'] } };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phoneForms(phones: string[]): string[] {
  const out = new Set<string>();
  for (const raw of phones) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length < 10) continue;
    const ten = digits.slice(-10);
    out.add(ten);
    out.add('91' + ten);
    out.add('+91' + ten);
    out.add(String(raw));
  }
  return Array.from(out);
}

/** Midnight UTC of today's calendar day in India, as membership dates are stored. */
function indiaToday(now: Date = new Date()): Date {
  return new Date(new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00.000Z');
}

const ROLE_PARTS: Record<string, { collection: AudiencePart['collection']; label: string; app: DeviceApp }> = {
  customers: { collection: 'users', label: 'Customers', app: 'user' },
  artists: { collection: 'artists', label: 'Artists', app: 'organizer' },
  organisers: { collection: 'organizers', label: 'Organisers', app: 'organizer' },
};

/**
 * Turns an audience choice into database queries. Suspended and blocked
 * accounts are left out. Returns an error string when the audience needs a
 * value that is missing or does not match anything.
 *
 * `value` is used by the older audiences "city" and "followers_of_artist"
 * (push campaigns). `filters` narrows customers, artists, organisers and all.
 */
export async function resolveAudience(
  db: Db,
  audience: string,
  value?: string | null,
  filters: AudienceFilters = {}
): Promise<AudiencePart[] | string> {
  const input = typeof value === 'string' ? value.trim() : '';
  switch (audience) {
    case 'all_users':
      return [{ collection: 'users', label: 'Customers', filter: { ...NOT_RESTRICTED }, app: 'user' }];
    case 'city': {
      if (!input) return 'Enter the city in "Audience value"';
      return [
        {
          collection: 'users',
          label: `Customers in ${input}`,
          filter: { ...NOT_RESTRICTED, city: { $regex: `^${escapeRegex(input)}$`, $options: 'i' } },
          app: 'user',
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
          app: 'user',
        },
      ];
    }
    case 'customers':
    case 'artists':
    case 'organisers':
    case 'all':
      break;
    default:
      return 'Unknown audience';
  }

  const roles = audience === 'all' ? ['customers', 'artists', 'organisers'] : [audience];
  const city = typeof filters.city === 'string' ? filters.city.trim().slice(0, 80) : '';
  const eventRef = typeof filters.event === 'string' ? filters.event.trim().slice(0, 200) : '';
  const membership = filters.membership && ['active', 'expired', 'none'].includes(filters.membership) ? filters.membership : null;
  if ((eventRef || membership) && audience !== 'customers') {
    return 'The event and membership filters are for customers only: choose the audience "Customers"';
  }

  const customerConditions: Record<string, any>[] = [];
  const customerLabels: string[] = [];

  if (eventRef) {
    const byId = ObjectId.isValid(eventRef) && eventRef.length === 24 ? await db.collection('events').findOne({ _id: new ObjectId(eventRef) }, { projection: { name: 1 } }) : null;
    let event = byId;
    if (!event) {
      const named = await db
        .collection('events')
        .find({ name: { $regex: `^${escapeRegex(eventRef)}$`, $options: 'i' } }, { projection: { name: 1 } })
        .limit(2)
        .toArray();
      if (named.length > 1) return `More than one event is called "${eventRef}": use the event ID instead`;
      event = named[0] || null;
    }
    if (!event) return `No event matches "${eventRef}"`;
    const bookingFilter: Record<string, any> = { eventId: String(event._id) };
    if (filters.attendedOnly) bookingFilter.$or = [{ status: 'attended' }, { checkedIn: true }];
    else bookingFilter.status = { $in: ['confirmed', 'attended'] };
    const phones = (await db.collection('bookings').distinct('userPhone', bookingFilter)) as string[];
    customerConditions.push({ phone: { $in: phoneForms(phones) } });
    customerLabels.push(`${filters.attendedOnly ? 'who attended' : 'who booked'} ${event.name || 'the event'}`);
  }

  if (membership) {
    const today = indiaToday();
    const subscriptions = db.collection('membershipSubscriptions');
    const activePhones = (await subscriptions.distinct('memberPhone', { status: 'active', expiresOn: { $gte: today } })) as string[];
    if (membership === 'active') {
      customerConditions.push({ phone: { $in: phoneForms(activePhones) } });
      customerLabels.push('with an active membership');
    } else {
      const everyone = (await subscriptions.distinct('memberPhone', {})) as string[];
      if (membership === 'expired') {
        const active = new Set(phoneForms(activePhones));
        const lapsed = everyone.filter((phone) => !active.has(String(phone)));
        customerConditions.push({ phone: { $in: phoneForms(lapsed), $nin: phoneForms(activePhones) } });
        customerLabels.push('whose membership has ended');
      } else {
        customerConditions.push({ phone: { $nin: phoneForms(everyone) } });
        customerLabels.push('without a membership');
      }
    }
  }

  return roles.map((role) => {
    const spec = ROLE_PARTS[role];
    const conditions: Record<string, any>[] = [{ ...NOT_RESTRICTED }];
    if (city) conditions.push({ city: { $regex: `^${escapeRegex(city)}$`, $options: 'i' } });
    if (role === 'customers') conditions.push(...customerConditions);
    const label = [spec.label, city ? `in ${city}` : '', role === 'customers' ? customerLabels.join(' and ') : ''].filter(Boolean).join(' ');
    return { collection: spec.collection, label, filter: conditions.length === 1 ? conditions[0] : { $and: conditions }, app: spec.app };
  });
}

export async function countAudience(db: Db, parts: AudiencePart[]) {
  const breakdown = await Promise.all(
    parts.map(async (part) => ({ label: part.label, count: await db.collection(part.collection).countDocuments(part.filter) }))
  );
  return { total: breakdown.reduce((sum, b) => sum + b.count, 0), breakdown };
}

const PHONE_FIELD = { phone: { $regex: '^\\+?[0-9]{10,13}$' } };
const EMAIL_FIELD = { email: { $regex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' } };

/**
 * How many of the audience each channel can reach right now: recipients with
 * a phone (SMS, WhatsApp), an email address, or at least one valid device
 * token for their app (push, with the number of devices).
 */
export async function channelReach(
  db: Db,
  parts: AudiencePart[],
  channels: Channel[]
): Promise<{ channel: Channel; recipients: number; devices?: number }[]> {
  const out: { channel: Channel; recipients: number; devices?: number }[] = [];
  for (const channel of channels) {
    let recipients = 0;
    let devices = 0;
    for (const part of parts) {
      const collection = db.collection(part.collection);
      if (channel === 'email') {
        recipients += await collection.countDocuments({ $and: [part.filter, EMAIL_FIELD] });
      } else if (channel === 'sms' || channel === 'whatsapp') {
        recipients += await collection.countDocuments({ $and: [part.filter, PHONE_FIELD] });
      } else {
        const tokenPhones = (await db.collection(DEVICE_COLLECTION).distinct('phone', { status: 'valid', app: part.app })) as string[];
        if (tokenPhones.length === 0) continue;
        const phones = (await collection.distinct('phone', { $and: [part.filter, { phone: { $in: tokenPhones } }] })) as string[];
        recipients += phones.length;
        devices += await db.collection(DEVICE_COLLECTION).countDocuments({ status: 'valid', app: part.app, phone: { $in: phones } });
      }
    }
    out.push(channel === 'push' ? { channel, recipients, devices } : { channel, recipients });
  }
  return out;
}

export interface Recipient {
  type: 'user' | 'artist' | 'organizer';
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  app: DeviceApp;
  /** Index of the audience part the recipient came from (for resuming a batch). */
  part: number;
}

function toRecipient(doc: any, part: AudiencePart, index = 0): Recipient {
  const type = part.collection === 'users' ? 'user' : part.collection === 'artists' ? 'artist' : 'organizer';
  return {
    type,
    id: String(doc._id),
    name: text(doc.name, 120),
    phone: text(doc.phone, 20),
    email: text(doc.email, 200),
    city: text(doc.city, 80),
    app: part.app,
    part: index,
  };
}

const RECIPIENT_PROJECTION = { name: 1, phone: 1, email: 1, city: 1 };

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
      .find(part.filter, { projection: RECIPIENT_PROJECTION })
      .sort({ _id: 1 })
      .skip(toSkip)
      .limit(limit - out.length)
      .toArray();
    toSkip = 0;
    for (const doc of docs) out.push(toRecipient(doc, part, parts.indexOf(part)));
  }
  return out;
}

/** Where a batch stopped: the audience part and the last _id sent to in it. */
export interface AudienceCursor {
  part: number;
  lastId: string | null;
}

/**
 * The next batch of recipients after `cursor`. Uses the _id order, so
 * accounts added while an announcement is being sent are reached at the end
 * and nobody is skipped or reached twice when others are removed.
 */
export async function loadRecipientBatch(
  db: Db,
  parts: AudiencePart[],
  cursor: AudienceCursor | null,
  limit: number
): Promise<{ recipients: Recipient[]; cursor: AudienceCursor; done: boolean }> {
  const out: Recipient[] = [];
  let part = cursor?.part || 0;
  let lastId = cursor?.lastId && ObjectId.isValid(cursor.lastId) ? new ObjectId(cursor.lastId) : null;
  while (part < parts.length && out.length < limit) {
    const spec = parts[part];
    const want = limit - out.length;
    const filter = lastId ? { $and: [spec.filter, { _id: { $gt: lastId } }] } : spec.filter;
    const docs = await db
      .collection(spec.collection)
      .find(filter, { projection: RECIPIENT_PROJECTION })
      .sort({ _id: 1 })
      .limit(want)
      .toArray();
    for (const doc of docs) out.push(toRecipient(doc, spec, part));
    if (docs.length === want) {
      // The batch is full: the next one continues in this part after the last _id.
      lastId = docs[docs.length - 1]._id;
      break;
    }
    part += 1;
    lastId = null;
  }
  const next: AudienceCursor = { part, lastId: lastId ? String(lastId) : null };
  let done = part >= parts.length;
  if (!done) {
    // Check whether anything is left, so the last batch is reported as the last one.
    let probePart = part;
    let probeId = lastId;
    done = true;
    while (probePart < parts.length) {
      const spec = parts[probePart];
      const filter = probeId ? { $and: [spec.filter, { _id: { $gt: probeId } }] } : spec.filter;
      if (await db.collection(spec.collection).findOne(filter, { projection: { _id: 1 } })) {
        done = false;
        break;
      }
      probePart += 1;
      probeId = null;
    }
  }
  return { recipients: out, cursor: next, done };
}

/** The address a recipient has for a channel. Push uses device tokens, looked up with validTokensFor(). */
export function addressFor(recipient: Pick<Recipient, 'phone' | 'email'>, channel: Channel): string {
  if (channel === 'email') return recipient.email;
  if (channel === 'push') return '';
  return recipient.phone;
}

/** Shows a phone or email address with most of it hidden, for previews. */
export function maskAddress(value: string): string {
  if (!value) return '';
  const at = value.indexOf('@');
  if (at > 0) return value.slice(0, Math.min(2, at)) + '***' + value.slice(at);
  return value.length > 4 ? value.slice(0, 2) + '*'.repeat(Math.max(0, value.length - 4)) + value.slice(-2) : '****';
}

/** Largest number of recipients one "send" run will process. */
export const MAX_RECIPIENTS_PER_RUN = 200;
/** Emergency announcements go out faster: more recipients per run. */
export const MAX_EMERGENCY_RECIPIENTS_PER_RUN = 1000;
