import type { Db } from 'mongodb';
import { connectToDatabase } from './mongodb';
import { getRazorpayConfig, verifyRazorpayCredentials } from './razorpay';

/**
 * System health (requirements section 18).
 *
 * Every check here reads something real: the database, the process
 * environment, the stored gateway settings or a log collection. Nothing is
 * assumed to be healthy. A check that has nothing to read reports "unknown"
 * and says why.
 */

export type CheckStatus = 'ok' | 'warning' | 'failed' | 'unknown';

export interface HealthDetail {
  label: string;
  value: string;
  status?: CheckStatus;
}

export interface HealthFailure {
  at: string | null;
  source: string;
  message: string;
  path?: string | null;
}

export interface HealthCheck {
  key: 'database' | 'configuration' | 'payment_gateway' | 'payment_webhooks' | 'sms_provider' | 'application_errors';
  label: string;
  status: CheckStatus;
  /** One sentence describing the state. */
  summary: string;
  details: HealthDetail[];
  /** Recent failures behind the status, newest first. */
  failures?: HealthFailure[];
  /** Explains the limits of the check, when it has any. */
  note?: string;
}

export interface HealthReport {
  overall: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  durationMs: number;
  checks: HealthCheck[];
}

const DAY = 24 * 60 * 60 * 1000;
const DB_TIMEOUT_MS = 5000;

/** Collections whose size is reported on the status page. */
export const MAIN_COLLECTIONS = [
  'users', 'artists', 'organizers', 'events', 'bookings', 'venues', 'transactions', 'refunds', 'settlements',
  'webhookEvents', 'auditLogs', 'supportCases', 'admins',
];

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not answer within ${ms / 1000} seconds`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function iso(value: any): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeMessage(error: any): string {
  // Connection errors can quote the connection string. Never pass that on.
  return String(error?.message || error || 'Unknown error')
    .replace(/mongodb(\+srv)?:\/\/\S+/gi, '[connection string hidden]')
    .slice(0, 300);
}

/* ------------------------------------------------------------------ */
/* Error log                                                           */
/* ------------------------------------------------------------------ */

/**
 * Records a server error so it shows on the System Health page.
 *
 *   } catch (error) {
 *     await logServerError('bookings.create', error, request.nextUrl.pathname);
 *   }
 *
 * Never throws: a failure to log is written to the server console only.
 */
export async function logServerError(source: string, error: unknown, path?: string | null): Promise<void> {
  try {
    const { db } = await connectToDatabase();
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
    await db.collection('errorLogs').insertOne({
      source: String(source || 'unknown').slice(0, 120),
      message: safeMessage(message).slice(0, 1000),
      path: path ? String(path).slice(0, 300) : null,
      createdAt: new Date(),
    });
  } catch (loggingError) {
    console.error('Failed to record a server error:', loggingError);
  }
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

/** Quick liveness probe used by the public health endpoint. */
export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number | null; db: Db | null; error: string | null }> {
  const started = Date.now();
  try {
    const { db } = await withTimeout(connectToDatabase(), DB_TIMEOUT_MS, 'The database');
    await withTimeout(db.command({ ping: 1 }), DB_TIMEOUT_MS, 'The database');
    return { ok: true, latencyMs: Date.now() - started, db, error: null };
  } catch (error) {
    return { ok: false, latencyMs: null, db: null, error: safeMessage(error) };
  }
}

async function checkDatabase(): Promise<{ check: HealthCheck; db: Db | null }> {
  const base = { key: 'database' as const, label: 'Database' };
  const connection = await pingDatabase();
  if (!connection.ok || !connection.db) {
    return {
      db: null,
      check: { ...base, status: 'failed', summary: 'The database did not answer.', details: [{ label: 'Error', value: connection.error || 'Unknown error', status: 'failed' }] },
    };
  }

  const db = connection.db;
  // Measure a second ping on the open connection: the first includes connecting.
  const pingStart = Date.now();
  await db.command({ ping: 1 });
  const latencyMs = Date.now() - pingStart;

  const details: HealthDetail[] = [
    { label: 'Response time', value: `${latencyMs} ms`, status: latencyMs > 1000 ? 'warning' : 'ok' },
  ];
  let status: CheckStatus = latencyMs > 1000 ? 'warning' : 'ok';
  let summary = latencyMs > 1000 ? `The database answered slowly (${latencyMs} ms).` : `The database answered in ${latencyMs} ms.`;

  try {
    const build = await db.command({ buildInfo: 1 });
    details.push({ label: 'Server version', value: `MongoDB ${build.version}` });
  } catch {
    details.push({ label: 'Server version', value: 'Not available to this database user', status: 'unknown' });
  }

  try {
    const stats = await db.stats();
    details.push(
      { label: 'Database name', value: db.databaseName },
      { label: 'Data size', value: bytes(stats.dataSize) },
      { label: 'Storage size on disk', value: bytes(stats.storageSize) },
      { label: 'Index size', value: bytes(stats.indexSize) },
      { label: 'Collections', value: String(stats.collections) },
      { label: 'Documents', value: Number(stats.objects || 0).toLocaleString('en-IN') }
    );
  } catch (error) {
    status = 'warning';
    summary = 'The database answers, but its statistics could not be read.';
    details.push({ label: 'Statistics', value: safeMessage(error), status: 'warning' });
  }

  const counts = await Promise.all(
    MAIN_COLLECTIONS.map(async (name) => {
      try {
        return { name, count: await db.collection(name).estimatedDocumentCount() };
      } catch {
        return { name, count: null as number | null };
      }
    })
  );
  for (const { name, count } of counts) {
    details.push({ label: `Documents in ${name}`, value: count === null ? 'Could not be counted' : count.toLocaleString('en-IN') });
  }

  return { db, check: { ...base, status, summary, details } };
}

function checkConfiguration(): HealthCheck {
  const production = process.env.NODE_ENV === 'production';
  const details: HealthDetail[] = [
    { label: 'Environment', value: process.env.NODE_ENV || 'not set' },
  ];
  const problems: { status: CheckStatus; text: string }[] = [];
  const add = (label: string, status: CheckStatus, value: string, problem?: string) => {
    details.push({ label, value, status });
    if (problem && status !== 'ok') problems.push({ status, text: problem });
  };

  // Values are never returned: only whether each one is set and usable.
  const jwt = (process.env.JWT_SECRET || '').trim();
  if (!jwt) {
    add('JWT_SECRET', production ? 'failed' : 'warning', production ? 'Not set: nobody can sign in' : 'Not set: a development value from the source code is in use', 'JWT_SECRET is not set');
  } else if (jwt.length < 16) {
    add('JWT_SECRET', production ? 'failed' : 'warning', `Set, but too short (${jwt.length} characters; at least 16 are required, 32 recommended)`, 'JWT_SECRET is too short');
  } else if (jwt.length < 32) {
    add('JWT_SECRET', 'warning', `Set (${jwt.length} characters; 32 or more recommended)`, 'JWT_SECRET is shorter than recommended');
  } else {
    add('JWT_SECRET', 'ok', `Set (${jwt.length} characters)`);
  }

  const encryption = (process.env.SETTINGS_ENCRYPTION_KEY || '').trim();
  if (encryption) {
    add('SETTINGS_ENCRYPTION_KEY', 'ok', 'Set');
  } else {
    add(
      'SETTINGS_ENCRYPTION_KEY',
      'warning',
      'Not set: stored secrets are encrypted with JWT_SECRET instead, so changing JWT_SECRET would make them unreadable',
      'SETTINGS_ENCRYPTION_KEY is not set'
    );
  }

  const uri = (process.env.MONGODB_URI || '').trim();
  const local = /^mongodb(\+srv)?:\/\/([^@/]*@)?(localhost|127\.0\.0\.1|\[?::1\]?|0\.0\.0\.0)([:/,?]|$)/i.test(uri);
  if (!uri) {
    add('MONGODB_URI', production ? 'failed' : 'warning', 'Not set: the application falls back to a database on localhost', 'MONGODB_URI is not set');
  } else if (local && production) {
    add('MONGODB_URI', 'failed', 'Set, but points at localhost while running in production', 'MONGODB_URI points at localhost in production');
  } else {
    add('MONGODB_URI', 'ok', local ? 'Set (local database; this is not a production environment)' : 'Set (remote database)');
  }

  add('DATABASE_NAME', process.env.DATABASE_NAME ? 'ok' : 'warning', process.env.DATABASE_NAME ? 'Set' : 'Not set: the default name "mookalaa" is used', 'DATABASE_NAME is not set');

  const failed = problems.filter((p) => p.status === 'failed');
  const status: CheckStatus = failed.length ? 'failed' : problems.length ? 'warning' : 'ok';
  return {
    key: 'configuration',
    label: 'Configuration',
    status,
    summary: problems.length ? problems.map((p) => p.text).join('; ') + '.' : 'Required settings are present.',
    details,
    note: 'Only whether each setting is present is shown. The values are never sent to the browser.',
  };
}

async function checkGateway(): Promise<HealthCheck> {
  const base = { key: 'payment_gateway' as const, label: 'Payment gateway (Razorpay)' };
  try {
    const config = await getRazorpayConfig();
    const production = process.env.NODE_ENV === 'production';
    const details: HealthDetail[] = [
      { label: 'Keys', value: config.isConfigured ? 'Key ID and secret saved' : config.hasKeyId ? 'Key ID saved, secret missing' : 'Not saved', status: config.isConfigured ? 'ok' : 'warning' },
      { label: 'Mode', value: config.isConfigured || config.hasKeyId ? (config.mode === 'live' ? 'Live' : config.mode === 'test' ? 'Test' : 'Unknown') : 'Not applicable' },
      { label: 'Accepting payments', value: config.enabled ? 'Switched on' : 'Switched off by an admin', status: config.enabled ? 'ok' : 'warning' },
      { label: 'Keys come from', value: config.source === 'database' ? 'Admin panel settings' : config.source === 'environment' ? 'Environment variables' : 'Nowhere' },
    ];
    if (config.updatedAt) details.push({ label: 'Settings last changed', value: config.updatedAt.toISOString() });

    let status: CheckStatus = 'ok';
    let summary = `Configured in ${config.mode} mode and switched on.`;
    if (config.secretDecryptFailed) {
      status = 'failed';
      summary = 'A gateway secret is saved but cannot be decrypted. The encryption key has probably changed; save the secret again.';
    } else if (!config.isConfigured) {
      status = 'warning';
      summary = 'Razorpay keys are not configured, so customers cannot pay.';
    } else if (!config.enabled) {
      status = 'warning';
      summary = 'Razorpay is configured but switched off, so customers cannot pay.';
    } else if (config.mode !== 'live' && production) {
      status = 'warning';
      summary = `Razorpay is in ${config.mode} mode on a production deployment: no real money is collected.`;
    }

    return {
      ...base,
      status,
      summary,
      details,
      note: 'This reads the saved settings only. Use "Test connection" to check the keys with Razorpay.',
    };
  } catch (error) {
    return { ...base, status: 'failed', summary: 'The gateway settings could not be read.', details: [{ label: 'Error', value: safeMessage(error), status: 'failed' }] };
  }
}

/** Calls Razorpay with the saved keys. Only run when an admin asks for it. */
export async function testGatewayConnection(): Promise<{ status: CheckStatus; message: string; mode: string; testedAt: string }> {
  const config = await getRazorpayConfig();
  const testedAt = new Date().toISOString();
  if (!config.isConfigured) {
    return { status: 'warning', message: 'Razorpay keys are not configured, so there is nothing to test.', mode: config.mode, testedAt };
  }
  const result = await verifyRazorpayCredentials(config.keyId, config.keySecret);
  return { status: result.valid ? 'ok' : 'failed', message: result.message, mode: config.mode, testedAt };
}

async function checkWebhooks(db: Db, gatewayActive: boolean): Promise<HealthCheck> {
  const base = { key: 'payment_webhooks' as const, label: 'Payment webhooks' };
  const collection = db.collection('webhookEvents');
  const from = new Date(Date.now() - DAY);

  const [last, total, in24h, invalid24h, errors24h, recent] = await Promise.all([
    collection.find({}, { projection: { receivedAt: 1, event: 1 } }).sort({ receivedAt: -1 }).limit(1).next(),
    collection.estimatedDocumentCount(),
    collection.countDocuments({ receivedAt: { $gte: from } }),
    collection.countDocuments({ receivedAt: { $gte: from }, signatureValid: false }),
    collection.countDocuments({ receivedAt: { $gte: from }, error: { $nin: [null, '', false] } }),
    collection
      .find(
        { $or: [{ signatureValid: false }, { error: { $nin: [null, '', false] } }] },
        { projection: { event: 1, eventId: 1, error: 1, signatureValid: 1, receivedAt: 1 } }
      )
      .sort({ receivedAt: -1 })
      .limit(10)
      .toArray(),
  ]);

  if (total === 0 || !last) {
    return {
      ...base,
      status: gatewayActive ? 'warning' : 'unknown',
      summary: gatewayActive
        ? 'No deliveries yet. The gateway is switched on, so check that the webhook URL is registered in the Razorpay dashboard.'
        : 'No deliveries yet.',
      details: [{ label: 'Deliveries received', value: '0' }],
      note: 'Razorpay sends webhooks to /api/payment/webhook. Each delivery is stored in webhookEvents.',
    };
  }

  const status: CheckStatus = invalid24h > 0 || errors24h > 0 ? 'warning' : 'ok';
  const problems = [
    invalid24h ? `${invalid24h} with an invalid signature` : '',
    errors24h ? `${errors24h} that could not be processed` : '',
  ].filter(Boolean);

  return {
    ...base,
    status,
    summary: problems.length
      ? `${in24h} deliveries in the last 24 hours, including ${problems.join(' and ')}.`
      : `${in24h} deliveries in the last 24 hours, none rejected or failed.`,
    details: [
      { label: 'Last delivery received', value: iso(last.receivedAt) || 'Unknown' },
      { label: 'Last event', value: String(last.event || 'Unknown') },
      { label: 'Deliveries in 24 hours', value: String(in24h) },
      { label: 'Invalid signatures in 24 hours', value: String(invalid24h), status: invalid24h ? 'warning' : 'ok' },
      { label: 'Processing errors in 24 hours', value: String(errors24h), status: errors24h ? 'warning' : 'ok' },
      { label: 'Deliveries stored in total', value: total.toLocaleString('en-IN') },
    ],
    failures: recent.map((row) => ({
      at: iso(row.receivedAt),
      source: String(row.event || 'webhook'),
      message: row.signatureValid === false ? 'Invalid signature: the delivery was rejected' : String(row.error).slice(0, 300),
      path: row.eventId ? String(row.eventId) : null,
    })),
  };
}

/** True when a stored value looks like a real setting rather than an empty placeholder. */
function filled(value: any): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

async function checkSms(db: Db): Promise<HealthCheck> {
  const base = { key: 'sms_provider' as const, label: 'SMS / OTP provider' };
  const doc = await db.collection('settings').findOne({ type: 'notifications' });
  const note =
    'Read from the notification settings (Communications > Channels & Providers). This shows whether a provider is saved, not whether messages are being delivered.';

  if (!doc) {
    return {
      ...base,
      status: 'warning',
      summary: 'No SMS provider is configured. No notification settings have been saved yet.',
      details: [{ label: 'Notification settings', value: 'Not saved', status: 'warning' }],
      note,
    };
  }

  // The settings document belongs to the Communications module. Accept the
  // shapes it may take: { sms: {...} }, { channels: { sms: {...} } } or flat keys.
  const sms = doc.sms || doc.channels?.sms || doc.providers?.sms || null;
  const provider = sms?.provider || sms?.name || doc.smsProvider || null;
  const hasCredential = sms
    ? Object.entries(sms).some(([key, value]) => /key|token|secret|sid|password|auth/i.test(key) && filled(value))
    : filled(doc.smsApiKey) || filled(doc.smsAuthKey);
  const enabled = sms ? sms.enabled !== false : doc.smsEnabled !== false;
  const configured = filled(provider) && hasCredential;

  const details: HealthDetail[] = [
    { label: 'Provider', value: filled(provider) ? String(provider) : 'Not chosen', status: filled(provider) ? 'ok' : 'warning' },
    { label: 'Credentials', value: hasCredential ? 'Saved' : 'Not saved', status: hasCredential ? 'ok' : 'warning' },
    { label: 'Channel', value: enabled ? 'Switched on' : 'Switched off', status: enabled ? 'ok' : 'warning' },
  ];
  const updated = iso(doc.updatedAt);
  if (updated) details.push({ label: 'Settings last changed', value: updated });

  if (!configured) {
    return { ...base, status: 'warning', summary: 'No SMS provider is configured, so OTP and SMS messages cannot be sent.', details, note };
  }
  if (!enabled) {
    return { ...base, status: 'warning', summary: `${provider} is configured but the SMS channel is switched off.`, details, note };
  }
  return { ...base, status: 'ok', summary: `${provider} is configured and switched on.`, details, note };
}

async function checkErrors(db: Db): Promise<HealthCheck> {
  const collection = db.collection('errorLogs');
  const from = new Date(Date.now() - DAY);
  const [in24h, total, recent] = await Promise.all([
    collection.countDocuments({ createdAt: { $gte: from } }),
    collection.estimatedDocumentCount(),
    collection.find({}, { projection: { source: 1, message: 1, path: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);

  return {
    key: 'application_errors',
    label: 'Application errors',
    status: in24h > 0 ? 'warning' : total > 0 ? 'ok' : 'unknown',
    summary:
      in24h > 0
        ? `${in24h} error${in24h === 1 ? '' : 's'} recorded in the last 24 hours.`
        : total > 0
        ? 'No errors recorded in the last 24 hours.'
        : 'No errors have been recorded. That does not mean none happened: see the note below.',
    details: [
      { label: 'Errors in 24 hours', value: String(in24h), status: in24h ? 'warning' : undefined },
      { label: 'Errors stored in total', value: total.toLocaleString('en-IN') },
    ],
    failures: recent.map((row) => ({
      at: iso(row.createdAt),
      source: String(row.source || 'unknown'),
      message: String(row.message || '').slice(0, 300),
      path: row.path || null,
    })),
    note: 'Only errors recorded through logServerError() in lib/health.ts appear here. Most routes do not call it yet, so other failures are visible only in the hosting provider’s logs.',
  };
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

function failedCheck(key: HealthCheck['key'], label: string, error: unknown, databaseDown: boolean): HealthCheck {
  return {
    key,
    label,
    status: 'unknown',
    summary: databaseDown ? 'Could not be checked because the database is not answering.' : 'This check could not be run.',
    details: databaseDown ? [] : [{ label: 'Error', value: safeMessage(error), status: 'unknown' }],
  };
}

/**
 * Runs every check and returns one object for the status page and the
 * dashboard. `overall` is "down" when the database does not answer,
 * "degraded" when any check failed or needs attention, otherwise "ok".
 */
export async function getSystemHealth(): Promise<HealthReport> {
  const started = Date.now();
  const { check: database, db } = await checkDatabase();
  const configuration = checkConfiguration();
  // The gateway settings live in the database, so they cannot be read while it is down.
  const gateway = db ? await checkGateway() : failedCheck('payment_gateway', 'Payment gateway (Razorpay)', null, true);
  const gatewayActive = gateway.status === 'ok';

  const dependent = async (key: HealthCheck['key'], label: string, run: (db: Db) => Promise<HealthCheck>) => {
    if (!db) return failedCheck(key, label, null, true);
    try {
      return await run(db);
    } catch (error) {
      console.error(`Health check "${key}" failed:`, error);
      return failedCheck(key, label, error, false);
    }
  };

  const [webhooks, sms, errors] = await Promise.all([
    dependent('payment_webhooks', 'Payment webhooks', (d) => checkWebhooks(d, gatewayActive)),
    dependent('sms_provider', 'SMS / OTP provider', (d) => checkSms(d)),
    dependent('application_errors', 'Application errors', (d) => checkErrors(d)),
  ]);

  const checks = [database, configuration, gateway, webhooks, sms, errors];
  const overall: HealthReport['overall'] =
    database.status === 'failed' ? 'down' : checks.some((c) => c.status === 'failed' || c.status === 'warning') ? 'degraded' : 'ok';

  return { overall, checkedAt: new Date().toISOString(), durationMs: Date.now() - started, checks };
}
