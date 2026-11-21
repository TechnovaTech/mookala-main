import type { Db } from 'mongodb';
import { getChannelConfig, sendOtpSms, verifyOtpSms } from './notifications';

/**
 * Phone one-time passwords for the website and the two apps. Server only.
 *
 * The code itself is generated and checked by the SMS provider (2Factor); this
 * server only keeps the provider's session id. No code is ever stored, logged
 * or returned.
 *
 * Collections
 *   otpChallenges  one document per phone:
 *                  { phone, sessionId, attempts, expiresAt, createdAt, consumedAt }
 *                  plus `sendLockAt` (time of the last send attempt, used for
 *                  the 30 second gap) and `purpose`.
 *   otpEvents      one document per send or verify attempt:
 *                  { phone, role, type: 'send' | 'verify', success, ip, createdAt }
 *
 * Modes
 *   sms   the SMS channel has a key and is switched on: real codes by SMS.
 *   dev   ALLOW_DEV_OTP === 'true' AND no SMS key is saved: the code 1234 is
 *         accepted and nothing is sent. Responses carry `devMode: true`.
 *   off   anything else: sending answers 503 and no code is accepted.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const SEND_GAP_MS = 30 * 1000;
export const SEND_WINDOW_MS = 10 * 60 * 1000;
export const MAX_SENDS_PER_WINDOW = 3;
export const IP_WINDOW_MS = 60 * 60 * 1000;
export const MAX_SENDS_PER_IP = 20;
export const MAX_WRONG_CODES = 5;

const CHALLENGES = 'otpChallenges';
const EVENTS = 'otpEvents';
const DEV_SESSION = 'dev';
const DEV_CODE = '1234';

export type OtpMode = 'sms' | 'dev' | 'off';
export type OtpRole = 'user' | 'artist' | 'organizer';

/** Anything with request headers: a NextRequest, a Request, or a test double. */
export interface RequestLike {
  headers: { get(name: string): string | null };
  ip?: string;
}

export type OtpResult =
  | { ok: true; phone: string; devMode: boolean; message: string }
  | { ok: false; status: number; error: string; retryAfterSeconds?: number; attemptsLeft?: number };

/**
 * A 10-digit Indian mobile number as a string, or null. Accepts an optional
 * +91 / 91 / 0 prefix, spaces and dashes. Anything that is not a string
 * (for example a Mongo operator object) is rejected.
 */
export function normalisePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let digits = value.trim().replace(/[\s\-()]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[1-9]\d{9}$/.test(digits) ? digits : null;
}

function ipOf(request: RequestLike | null | undefined): string | null {
  if (!request) return null;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 60) || null;
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim().slice(0, 60);
  return typeof request.ip === 'string' && request.ip ? request.ip : null;
}

function cleanRole(role: unknown): OtpRole | null {
  return role === 'user' || role === 'artist' || role === 'organizer' ? role : null;
}

export async function otpMode(db: Db): Promise<OtpMode> {
  const config = await getChannelConfig(db, 'sms');
  if (config.hasSecret) return config.enabled ? 'sms' : 'off';
  // A saved key that cannot be decrypted still counts as "configured".
  if (config.secretDecryptFailed) return 'off';
  return process.env.ALLOW_DEV_OTP === 'true' ? 'dev' : 'off';
}

const indexed = new WeakSet<Db>();
async function ensureIndexes(db: Db) {
  if (indexed.has(db)) return;
  indexed.add(db);
  try {
    await Promise.all([
      db.collection(CHALLENGES).createIndex({ phone: 1 }, { unique: true }),
      db.collection(EVENTS).createIndex({ phone: 1, type: 1, createdAt: -1 }),
      db.collection(EVENTS).createIndex({ ip: 1, type: 1, createdAt: -1 }),
    ]);
  } catch (error) {
    indexed.delete(db);
    console.error('Could not create OTP indexes:', error);
  }
}

async function logEvent(
  db: Db,
  entry: { phone: string; role: OtpRole | null; type: 'send' | 'verify'; success: boolean; ip: string | null }
) {
  try {
    await db.collection(EVENTS).insertOne({ ...entry, createdAt: new Date() });
  } catch (error) {
    console.error('Could not record the OTP event:', error);
  }
}

function secondsUntil(time: number, now: number): number {
  return Math.max(1, Math.ceil((time - now) / 1000));
}

/**
 * Sends a one-time password to the phone (or, in dev mode, opens a challenge
 * without sending anything). All limits are enforced here.
 */
export async function requestOtp(
  db: Db,
  input: { phone: unknown; purpose?: string; role?: string | null; request?: RequestLike | null }
): Promise<OtpResult> {
  const phone = normalisePhone(input.phone);
  if (!phone) return { ok: false, status: 400, error: 'Valid 10-digit phone number required' };

  const role = cleanRole(input.role);
  const ip = ipOf(input.request);
  const now = Date.now();
  const refuse = async (status: number, error: string, retryAfterSeconds?: number): Promise<OtpResult> => {
    await logEvent(db, { phone, role, type: 'send', success: false, ip });
    return { ok: false, status, error, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
  };

  const mode = await otpMode(db);
  if (mode === 'off') return refuse(503, 'OTP service is not configured');

  await ensureIndexes(db);
  const events = db.collection(EVENTS);
  const challenges = db.collection(CHALLENGES);

  // At most 3 codes per phone in 10 minutes.
  const recent = await events
    .find({ phone, type: 'send', success: true, createdAt: { $gt: new Date(now - SEND_WINDOW_MS) } })
    .sort({ createdAt: -1 })
    .limit(MAX_SENDS_PER_WINDOW)
    .project({ createdAt: 1 })
    .toArray();
  if (recent.length >= MAX_SENDS_PER_WINDOW) {
    const oldest = new Date(recent[recent.length - 1].createdAt).getTime();
    return refuse(
      429,
      'Too many codes were requested for this number. Please try again later.',
      secondsUntil(oldest + SEND_WINDOW_MS, now)
    );
  }

  // At most 20 codes per IP address in an hour. Skipped when the address is unknown.
  if (ip) {
    const fromIp = await events
      .find({ ip, type: 'send', success: true, createdAt: { $gt: new Date(now - IP_WINDOW_MS) } })
      .sort({ createdAt: -1 })
      .limit(MAX_SENDS_PER_IP)
      .project({ createdAt: 1 })
      .toArray();
    if (fromIp.length >= MAX_SENDS_PER_IP) {
      const oldest = new Date(fromIp[fromIp.length - 1].createdAt).getTime();
      return refuse(
        429,
        'Too many codes were requested from this network. Please try again later.',
        secondsUntil(oldest + IP_WINDOW_MS, now)
      );
    }
  }

  // 30 seconds between sends. The unique index on `phone` makes this claim
  // atomic: when the lock is still fresh the filter does not match, the upsert
  // tries to insert a second document for the phone and fails.
  try {
    await challenges.updateOne(
      { phone, $or: [{ sendLockAt: { $lte: new Date(now - SEND_GAP_MS) } }, { sendLockAt: null }] },
      {
        $set: { sendLockAt: new Date(now) },
        $setOnInsert: { sessionId: null, attempts: 0, expiresAt: new Date(0), createdAt: new Date(now), consumedAt: null },
      },
      { upsert: true }
    );
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const existing = await challenges.findOne({ phone }, { projection: { sendLockAt: 1 } });
    const lockedAt = existing?.sendLockAt ? new Date(existing.sendLockAt).getTime() : now;
    return refuse(429, 'Please wait a few seconds before requesting another code.', secondsUntil(lockedAt + SEND_GAP_MS, now));
  }

  let sessionId = DEV_SESSION;
  if (mode === 'sms') {
    const sent = await sendOtpSms(db, phone, { requestedBy: 'app' });
    if (!sent.ok || !sent.sessionId) {
      console.error('OTP SMS was not sent:', sent.error);
      return refuse(502, 'The code could not be sent. Please try again in a moment.');
    }
    sessionId = sent.sessionId;
  }

  await challenges.updateOne(
    { phone },
    {
      $set: {
        sessionId,
        attempts: 0,
        expiresAt: new Date(now + OTP_TTL_MS),
        createdAt: new Date(now),
        consumedAt: null,
        purpose: typeof input.purpose === 'string' ? input.purpose.slice(0, 40) : null,
      },
    }
  );
  await logEvent(db, { phone, role, type: 'send', success: true, ip });

  return { ok: true, phone, devMode: mode === 'dev', message: 'OTP sent successfully' };
}

/**
 * Checks the code a person typed. A code can be used once. After 5 wrong codes
 * the challenge is dead and a new code has to be requested.
 */
export async function checkOtp(
  db: Db,
  input: { phone: unknown; otp: unknown; role?: string | null; request?: RequestLike | null }
): Promise<OtpResult> {
  const phone = normalisePhone(input.phone);
  if (!phone) return { ok: false, status: 400, error: 'Valid 10-digit phone number required' };
  if (typeof input.otp !== 'string' || !/^\d{4,8}$/.test(input.otp.trim())) {
    return { ok: false, status: 400, error: 'Enter the code that was sent by SMS' };
  }
  const otp = input.otp.trim();

  const role = cleanRole(input.role);
  const ip = ipOf(input.request);
  const now = Date.now();
  const refuse = async (status: number, error: string, extra: Record<string, number> = {}): Promise<OtpResult> => {
    await logEvent(db, { phone, role, type: 'verify', success: false, ip });
    return { ok: false, status, error, ...extra };
  };

  const mode = await otpMode(db);
  if (mode === 'off') return refuse(503, 'OTP service is not configured');

  await ensureIndexes(db);
  const challenges = db.collection(CHALLENGES);
  const live = { phone, consumedAt: null, sessionId: { $ne: null }, expiresAt: { $gt: new Date(now) } };

  // Dev mode only: app builds released before real OTP never ask for a code,
  // so a challenge is opened on the first check instead. Never in sms mode.
  if (mode === 'dev') {
    const open = await challenges.findOne(live, { projection: { _id: 1 } });
    if (!open) {
      try {
        await challenges.updateOne(
          { phone },
          {
            $set: {
              sessionId: DEV_SESSION,
              attempts: 0,
              expiresAt: new Date(now + OTP_TTL_MS),
              createdAt: new Date(now),
              consumedAt: null,
            },
          },
          { upsert: true }
        );
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
      }
    }
  }

  // Take one of the five attempts before checking, so parallel guesses cannot exceed the limit.
  const claim = await challenges.updateOne({ ...live, attempts: { $lt: MAX_WRONG_CODES } }, { $inc: { attempts: 1 } });
  const challenge = await challenges.findOne({ phone });

  if (claim.matchedCount === 0) {
    const isLive =
      challenge && !challenge.consumedAt && challenge.sessionId && new Date(challenge.expiresAt).getTime() > now;
    if (isLive && challenge.attempts >= MAX_WRONG_CODES) {
      const lockedAt = challenge.sendLockAt ? new Date(challenge.sendLockAt).getTime() : 0;
      return refuse(429, 'Too many wrong codes. Please request a new code.', {
        retryAfterSeconds: secondsUntil(lockedAt + SEND_GAP_MS, now),
      });
    }
    if (challenge && !challenge.consumedAt && challenge.sessionId) {
      return refuse(400, 'This code has expired. Please request a new code.');
    }
    return refuse(400, 'Please request a code first.');
  }

  const sessionId = String(challenge?.sessionId || '');
  const attemptsLeft = Math.max(0, MAX_WRONG_CODES - Number(challenge?.attempts || 0));
  let matched = false;

  if (sessionId === DEV_SESSION) {
    // A challenge opened in dev mode is worthless once real SMS is connected.
    if (mode !== 'dev') return refuse(400, 'Please request a new code.');
    matched = otp === DEV_CODE;
  } else {
    const outcome = await verifyOtpSms(db, sessionId, otp);
    matched = outcome.ok;
    if (!matched && /could not reach|did not answer|unreadable response/i.test(outcome.error || '')) {
      // The provider failed, the person did not: give the attempt back.
      await challenges.updateOne({ phone, sessionId }, { $inc: { attempts: -1 } });
      return refuse(502, 'The code could not be checked right now. Please try again.');
    }
  }

  if (!matched) {
    return refuse(400, attemptsLeft > 0 ? 'Invalid OTP' : 'Invalid OTP. Please request a new code.', { attemptsLeft });
  }

  // Single use: only the request that marks the challenge consumed succeeds.
  const consumed = await challenges.updateOne(
    { phone, sessionId, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );
  if (consumed.matchedCount === 0) return refuse(400, 'This code was already used. Please request a new code.');

  await logEvent(db, { phone, role, type: 'verify', success: true, ip });
  return { ok: true, phone, devMode: mode === 'dev', message: 'OTP verified successfully' };
}
