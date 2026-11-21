import { connectToDatabase } from './mongodb';
import { encryptValue, decryptValue } from './crypto';

/**
 * Razorpay credentials are managed from the admin panel
 * (Settings -> Payment Gateway) and stored in the `settings` collection under
 * the document { type: 'payment' }.
 *
 * Environment variables (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are still
 * honoured as a fallback so existing deployments keep working until an admin
 * saves the keys from the panel.
 */

export const PAYMENT_SETTINGS_TYPE = 'payment';

/**
 * Base address of the Razorpay REST API. `RAZORPAY_BASE_URL` exists so tests
 * can point the server at a local stand-in; it is not set in production.
 */
export function razorpayBaseUrl(): string {
  const override = (process.env.RAZORPAY_BASE_URL || '').trim().replace(/\/+$/, '');
  return override || 'https://api.razorpay.com/v1';
}

export type RazorpayMode = 'test' | 'live' | 'unknown';
export type RazorpayConfigSource = 'database' | 'environment' | 'none';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  mode: RazorpayMode;
  source: RazorpayConfigSource;
  /** Admin can switch the gateway off without deleting the keys. */
  enabled: boolean;
  /** true when both a key id and a usable key secret are available. */
  isConfigured: boolean;
  hasKeyId: boolean;
  hasKeySecret: boolean;
  /** Set when a secret exists in the DB but could not be decrypted. */
  secretDecryptFailed: boolean;
  /** Whether env vars could be used as a fallback. */
  envFallbackAvailable: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
  /** Secret used to check the signature of Razorpay webhook deliveries. Server-side only. */
  webhookSecret: string;
  hasWebhookSecret: boolean;
  webhookSecretSource: RazorpayConfigSource;
  webhookSecretDecryptFailed: boolean;
}

export interface SaveRazorpayInput {
  keyId: string;
  /** Leave empty/undefined to keep the already stored secret. */
  keySecret?: string;
  enabled?: boolean;
  updatedBy?: string | null;
}

export interface RazorpayVerificationResult {
  valid: boolean;
  /** true when Razorpay explicitly rejected the credentials. */
  invalidCredentials: boolean;
  status: number | null;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export function detectMode(keyId?: string | null): RazorpayMode {
  if (!keyId) return 'unknown';
  if (keyId.startsWith('rzp_live_')) return 'live';
  if (keyId.startsWith('rzp_test_')) return 'test';
  return 'unknown';
}

const DOT = '•';

export function maskSecret(secret?: string | null): string {
  if (!secret) return '';
  if (secret.length <= 4) return DOT.repeat(secret.length);
  return DOT.repeat(Math.min(secret.length - 4, 20)) + secret.slice(-4);
}

export function maskKeyId(keyId?: string | null): string {
  if (!keyId) return '';
  const underscore = keyId.lastIndexOf('_');
  if (underscore === -1 || keyId.length - underscore <= 5) return keyId;
  const prefix = keyId.slice(0, underscore + 1);
  const tail = keyId.slice(-4);
  return prefix + DOT.repeat(6) + tail;
}

export function validateKeyId(keyId: unknown): { valid: boolean; error?: string } {
  if (typeof keyId !== 'string' || keyId.trim().length === 0) {
    return { valid: false, error: 'Razorpay Key ID is required' };
  }

  const value = keyId.trim();

  if (/\s/.test(value)) {
    return { valid: false, error: 'Razorpay Key ID cannot contain spaces' };
  }

  if (!/^rzp_(test|live)_[A-Za-z0-9]{8,}$/.test(value)) {
    return {
      valid: false,
      error:
        'Invalid Key ID format. It should look like rzp_test_xxxxxxxxxxxx or rzp_live_xxxxxxxxxxxx',
    };
  }

  return { valid: true };
}

export function validateKeySecret(keySecret: unknown): { valid: boolean; error?: string } {
  if (typeof keySecret !== 'string' || keySecret.trim().length === 0) {
    return { valid: false, error: 'Razorpay Key Secret is required' };
  }

  const value = keySecret.trim();

  if (/\s/.test(value)) {
    return { valid: false, error: 'Razorpay Key Secret cannot contain spaces' };
  }

  if (value.length < 10) {
    return { valid: false, error: 'Razorpay Key Secret looks too short' };
  }

  if (value.includes(DOT)) {
    return {
      valid: false,
      error: 'Please paste the real Key Secret, not the masked value',
    };
  }

  return { valid: true };
}

/* ------------------------------------------------------------------ */
/* Read                                                               */
/* ------------------------------------------------------------------ */

export async function getRazorpayConfig(): Promise<RazorpayConfig> {
  const envKeyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const envKeySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const envFallbackAvailable = Boolean(envKeyId);

  let doc: any = null;

  try {
    const { db } = await connectToDatabase();
    doc = await db.collection('settings').findOne({ type: PAYMENT_SETTINGS_TYPE });
  } catch (error) {
    console.error('Failed to read payment settings from database:', error);
  }

  const dbKeyId = typeof doc?.razorpayKeyId === 'string' ? doc.razorpayKeyId.trim() : '';
  const storedSecret = doc?.razorpayKeySecret;
  let dbKeySecret = '';
  let secretDecryptFailed = false;

  if (storedSecret) {
    const decrypted = decryptValue(storedSecret);
    if (decrypted) {
      dbKeySecret = decrypted.trim();
    } else {
      secretDecryptFailed = true;
    }
  }

  // The webhook secret is a separate value chosen when the webhook is created
  // in the Razorpay dashboard. It is stored encrypted like the key secret.
  const envWebhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  let dbWebhookSecret = '';
  let webhookSecretDecryptFailed = false;
  if (doc?.razorpayWebhookSecret) {
    const decrypted = decryptValue(doc.razorpayWebhookSecret);
    if (decrypted) dbWebhookSecret = decrypted.trim();
    else webhookSecretDecryptFailed = true;
  }
  const webhookSecret = dbWebhookSecret || envWebhookSecret;
  const webhookSecretSource: RazorpayConfigSource = dbWebhookSecret
    ? 'database'
    : envWebhookSecret
    ? 'environment'
    : 'none';

  // A key id saved by the admin always wins over the environment variable.
  const useDatabase = dbKeyId.length > 0;

  const keyId = useDatabase ? dbKeyId : envKeyId;
  const keySecret = useDatabase ? dbKeySecret : envKeySecret;
  const source: RazorpayConfigSource = useDatabase
    ? 'database'
    : envKeyId
    ? 'environment'
    : 'none';

  // The admin toggle applies whichever source the keys come from. When no
  // admin ever touched it the flag is absent, which means "on" - so existing
  // environment-only deployments keep working exactly as before.
  const enabled = doc?.enabled !== false;

  return {
    keyId,
    keySecret,
    mode: detectMode(keyId),
    source,
    enabled,
    isConfigured: Boolean(keyId && keySecret),
    hasKeyId: Boolean(keyId),
    hasKeySecret: Boolean(keySecret),
    secretDecryptFailed,
    envFallbackAvailable,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt) : null,
    updatedBy: doc?.updatedBy || null,
    webhookSecret,
    hasWebhookSecret: Boolean(webhookSecret),
    webhookSecretSource,
    webhookSecretDecryptFailed,
  };
}

/* ------------------------------------------------------------------ */
/* Write                                                              */
/* ------------------------------------------------------------------ */

export async function saveRazorpayConfig(input: SaveRazorpayInput) {
  const keyId = input.keyId.trim();
  const { db } = await connectToDatabase();

  const update: Record<string, any> = {
    type: PAYMENT_SETTINGS_TYPE,
    provider: 'razorpay',
    razorpayKeyId: keyId,
    mode: detectMode(keyId),
    enabled: input.enabled !== false,
    updatedAt: new Date(),
    updatedBy: input.updatedBy || null,
  };

  const newSecret = typeof input.keySecret === 'string' ? input.keySecret.trim() : '';
  if (newSecret) {
    update.razorpayKeySecret = encryptValue(newSecret);
  }

  await db.collection('settings').updateOne(
    { type: PAYMENT_SETTINGS_TYPE },
    {
      $set: update,
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  return getRazorpayConfig();
}

export async function setRazorpayEnabled(enabled: boolean, updatedBy?: string | null) {
  const { db } = await connectToDatabase();

  await db.collection('settings').updateOne(
    { type: PAYMENT_SETTINGS_TYPE },
    {
      $set: {
        type: PAYMENT_SETTINGS_TYPE,
        enabled,
        updatedAt: new Date(),
        updatedBy: updatedBy || null,
      },
      $setOnInsert: { createdAt: new Date(), provider: 'razorpay' },
    },
    { upsert: true }
  );

  return getRazorpayConfig();
}

export function validateWebhookSecret(secret: unknown): { valid: boolean; error?: string } {
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    return { valid: false, error: 'Webhook secret is required' };
  }
  const value = secret.trim();
  if (value.length < 8) return { valid: false, error: 'Webhook secret must be at least 8 characters' };
  if (value.length > 200) return { valid: false, error: 'Webhook secret is too long' };
  if (value.includes(DOT)) {
    return { valid: false, error: 'Please paste the real webhook secret, not the masked value' };
  }
  return { valid: true };
}

/** Saves the webhook secret (encrypted). The API keys are left untouched. */
export async function saveRazorpayWebhookSecret(secret: string, updatedBy?: string | null) {
  const { db } = await connectToDatabase();

  await db.collection('settings').updateOne(
    { type: PAYMENT_SETTINGS_TYPE },
    {
      $set: {
        type: PAYMENT_SETTINGS_TYPE,
        razorpayWebhookSecret: encryptValue(secret.trim()),
        webhookSecretUpdatedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: updatedBy || null,
      },
      $setOnInsert: { createdAt: new Date(), provider: 'razorpay' },
    },
    { upsert: true }
  );

  return getRazorpayConfig();
}

export async function clearRazorpayWebhookSecret(updatedBy?: string | null) {
  const { db } = await connectToDatabase();

  await db.collection('settings').updateOne(
    { type: PAYMENT_SETTINGS_TYPE },
    {
      $unset: { razorpayWebhookSecret: '', webhookSecretUpdatedAt: '' },
      $set: { updatedAt: new Date(), updatedBy: updatedBy || null },
    }
  );

  return getRazorpayConfig();
}

/** Removes the admin managed keys so the environment fallback applies again. */
export async function clearRazorpayConfig(updatedBy?: string | null) {
  const { db } = await connectToDatabase();

  await db.collection('settings').updateOne(
    { type: PAYMENT_SETTINGS_TYPE },
    {
      $unset: { razorpayKeyId: '', razorpayKeySecret: '', mode: '' },
      $set: { updatedAt: new Date(), updatedBy: updatedBy || null },
    }
  );

  return getRazorpayConfig();
}

/* ------------------------------------------------------------------ */
/* Verify against Razorpay                                            */
/* ------------------------------------------------------------------ */

export async function verifyRazorpayCredentials(
  keyId: string,
  keySecret: string
): Promise<RazorpayVerificationResult> {
  if (!keyId || !keySecret) {
    return {
      valid: false,
      invalidCredentials: false,
      status: null,
      message: 'Both Key ID and Key Secret are required to test the connection',
    };
  }

  const auth = Buffer.from(keyId + ':' + keySecret).toString('base64');

  try {
    const response = await fetch(razorpayBaseUrl() + '/payments?count=1', {
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (response.ok) {
      const modeLabel = detectMode(keyId) === 'live' ? 'Live' : 'Test';
      return {
        valid: true,
        invalidCredentials: false,
        status: response.status,
        message: 'Connected to Razorpay successfully (' + modeLabel + ' mode)',
      };
    }

    if (response.status === 401 || response.status === 400) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.error?.description || '';
      } catch {
        /* ignore body parse errors */
      }

      return {
        valid: false,
        invalidCredentials: true,
        status: response.status,
        message: detail
          ? 'Razorpay rejected these credentials: ' + detail
          : 'Razorpay rejected these credentials. Please check the Key ID and Key Secret.',
      };
    }

    return {
      valid: false,
      invalidCredentials: false,
      status: response.status,
      message:
        'Could not verify credentials right now (Razorpay returned ' +
        response.status +
        ').',
    };
  } catch (error: any) {
    return {
      valid: false,
      invalidCredentials: false,
      status: null,
      message: 'Could not reach Razorpay: ' + (error?.message || 'network error'),
    };
  }
}
