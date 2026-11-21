import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import type { Db } from 'mongodb';
import { getJwtSecret } from './jwt-edge';
import { accountStatusOf, restrictionFor } from './user-status';
import { checkOtp, normalisePhone, requestOtp, type OtpResult, type OtpRole, type RequestLike } from './otp';

/**
 * Sessions for the website and the two apps. Server only.
 *
 * After a phone passes OTP the client gets an "app token" and sends it as
 * `Authorization: Bearer <token>`. The token proves ownership of one phone
 * number; which roles that phone has (user / artist / organizer) is read from
 * the database on each request, never from the token.
 *
 * APP_AUTH_MODE
 *   'enforce'   every route that acts on a phone needs a token for that phone.
 *   otherwise   "transition": a request without a token is let through exactly
 *               as before real OTP existed, so installed app builds keep
 *               working; a request that does carry a token must match.
 */

export const APP_TOKEN_DAYS = 30;
export const PHONE_ERROR = 'Valid 10-digit phone number required';

export type AppRole = OtpRole;
export const ROLE_COLLECTION: Record<AppRole, 'users' | 'artists' | 'organizers'> = {
  user: 'users',
  artist: 'artists',
  organizer: 'organizers',
};

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

/**
 * App tokens are signed with a key derived from the JWT secret, not with the
 * secret itself. The admin panel verifies its own tokens with the raw secret
 * and does not look at `typ`, so a token signed with the raw secret would be
 * accepted there as a signed-in admin. With a derived key an app token fails
 * admin verification and an admin token fails verification here.
 */
function appTokenKey(): string | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('mookalaa-app-token-v1').digest('hex');
}

export function issueAppToken(phone: string): string {
  const key = appTokenKey();
  const clean = normalisePhone(phone);
  if (!key) throw new Error('JWT_SECRET is not configured');
  if (!clean) throw new Error('Cannot issue a token without a valid phone number');
  return jwt.sign({ typ: 'app', phone: clean }, key, { expiresIn: `${APP_TOKEN_DAYS}d`, algorithm: 'HS256' });
}

/** The phone inside a valid, unexpired app token, or null. */
export function verifyAppToken(token: string | null | undefined): string | null {
  const key = appTokenKey();
  if (!key || !token) return null;
  try {
    const payload = jwt.verify(token, key, { algorithms: ['HS256'] });
    if (!payload || typeof payload === 'string' || payload.typ !== 'app') return null;
    return normalisePhone(payload.phone);
  } catch {
    return null;
  }
}

function bearerOf(request: RequestLike): string | null {
  const header = request.headers.get('authorization');
  if (!header || !/^Bearer\s+/i.test(header)) return null;
  return header.replace(/^Bearer\s+/i, '').trim() || null;
}

/** Phone from a valid `Authorization: Bearer` app token, else null. */
export function getAppPhone(request: RequestLike): string | null {
  return verifyAppToken(bearerOf(request));
}

export function appAuthMode(): 'enforce' | 'transition' {
  return process.env.APP_AUTH_MODE === 'enforce' ? 'enforce' : 'transition';
}

function deny(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export type AppUserCheck =
  | { ok: true; phone: string; legacy: boolean }
  | { ok: false; response: NextResponse };

/**
 * The check for every app-facing route that reads or changes an account by
 * phone. `phone` is the raw value from the query or body.
 *   legacy: true   the request carried no token and was let through because
 *                  APP_AUTH_MODE is not 'enforce'.
 */
export function requireAppUser(request: RequestLike, phone: unknown): AppUserCheck {
  const clean = normalisePhone(phone);
  if (!clean) return { ok: false, response: deny(PHONE_ERROR, 400) };

  const token = bearerOf(request);
  if (!token) {
    if (appAuthMode() === 'enforce') {
      return { ok: false, response: deny('Please sign in again to continue.', 401) };
    }
    return { ok: true, phone: clean, legacy: true };
  }

  const tokenPhone = verifyAppToken(token);
  if (!tokenPhone) return { ok: false, response: deny('Your session has expired. Please sign in again.', 401) };
  if (tokenPhone !== clean) return { ok: false, response: deny('This session belongs to a different phone number.', 403) };
  return { ok: true, phone: clean, legacy: false };
}

/* ------------------------------------------------------------------ */
/* Request helpers                                                     */
/* ------------------------------------------------------------------ */

/** The JSON body as a plain object, or null when it is missing or not an object. */
export async function readBody(request: { json(): Promise<any> }): Promise<Record<string, any> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/** Turns a failed requestOtp / checkOtp result into the HTTP response. */
export function otpFailure(result: Extract<OtpResult, { ok: false }>) {
  const body: Record<string, any> = { success: false, error: result.error };
  if (result.retryAfterSeconds) body.retryAfterSeconds = result.retryAfterSeconds;
  if (typeof result.attemptsLeft === 'number') body.attemptsLeft = result.attemptsLeft;
  const response = NextResponse.json(body, { status: result.status });
  if (result.retryAfterSeconds) response.headers.set('Retry-After', String(result.retryAfterSeconds));
  return response;
}

export type OwnershipProof =
  | { ok: true; phone: string; via: 'token' | 'otp'; devMode: boolean }
  | { ok: false; response: NextResponse };

/**
 * Proof that the caller owns the phone: a valid app token for it, or a code
 * that passes checkOtp. Used by the login and verify routes, which may never
 * be reached with a phone number alone.
 */
export async function proveOwnership(
  db: Db,
  request: RequestLike,
  input: { phone: unknown; otp: unknown; role?: AppRole | null }
): Promise<OwnershipProof> {
  const phone = normalisePhone(input.phone);
  if (!phone) return { ok: false, response: deny(PHONE_ERROR, 400) };

  const token = bearerOf(request);
  if (token) {
    const tokenPhone = verifyAppToken(token);
    if (!tokenPhone) return { ok: false, response: deny('Your session has expired. Please sign in again.', 401) };
    if (tokenPhone !== phone) return { ok: false, response: deny('This session belongs to a different phone number.', 403) };
    return { ok: true, phone, via: 'token', devMode: false };
  }

  if (input.otp === undefined || input.otp === null || input.otp === '') {
    return { ok: false, response: deny('Phone and OTP required', appAuthMode() === 'enforce' ? 401 : 400) };
  }
  const checked = await checkOtp(db, { phone, otp: input.otp, role: input.role || null, request });
  if (!checked.ok) return { ok: false, response: otpFailure(checked) };
  return { ok: true, phone, via: 'otp', devMode: checked.devMode };
}

export const UNVERIFIED_ERROR = 'Verify your phone number before continuing';

/**
 * False while a profile is still 'pending', i.e. the phone has not passed OTP
 * for it. Such a profile can be created by anyone who knows the number, so it
 * may not be filled in or have documents attached.
 */
export function phoneVerified(doc: any): boolean {
  return Boolean(doc?.status) && doc.status !== 'pending';
}

/** Approximate decoded size of a base64 string or data URL, in bytes. */
export function base64Bytes(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const comma = value.startsWith('data:') ? value.indexOf(',') : -1;
  return Math.floor(((value.length - (comma + 1)) * 3) / 4);
}

/** Text from a request body: strings only, trimmed and capped. */
export function text(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** A base64 image from a request body. Not trimmed to a length: check the size first. */
export function imageText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/* ------------------------------------------------------------------ */
/* Roles and profiles                                                  */
/* ------------------------------------------------------------------ */

export type KycState = 'not_submitted' | 'pending' | 'approved' | 'rejected';

/**
 * KYC as the apps should show it. The stored `kycStatus` is missing (or
 * 'pending') both for someone who never uploaded documents and for someone
 * waiting for review; like the admin panel, the two are told apart by whether
 * an Aadhaar number was ever saved.
 */
export function kycStateOf(doc: any): KycState {
  if (doc?.kycStatus === 'approved' || doc?.kycStatus === 'rejected') return doc.kycStatus;
  return doc?.aadharId ? 'pending' : 'not_submitted';
}

export function canSubmitKyc(doc: any): boolean {
  const state = kycStateOf(doc);
  return state === 'not_submitted' || state === 'rejected';
}

export interface PhoneProfiles {
  /** Roles the phone holds and may use (restricted roles are left out). */
  roles: AppRole[];
  profiles: {
    user: { status: string; name: string | null } | null;
    artist: { status: string; name: string | null; kycStatus: KycState } | null;
    organizer: { status: string; name: string | null; kycStatus: KycState } | null;
  };
  /** Message for each role an admin has suspended or blocked. */
  restrictions: Partial<Record<AppRole, string>>;
}

/** Which collections hold the phone, with the little an app needs to route. */
export async function profilesFor(db: Db, phone: string): Promise<PhoneProfiles> {
  const projection = { status: 1, name: 1, kycStatus: 1, aadharId: 1, accountStatus: 1, isActive: 1 };
  const [user, artist, organizer] = await Promise.all([
    db.collection('users').findOne({ phone }, { projection }),
    db.collection('artists').findOne({ phone }, { projection }),
    db.collection('organizers').findOne({ phone }, { projection }),
  ]);

  const result: PhoneProfiles = {
    roles: [],
    profiles: {
      user: user ? { status: user.status || 'pending', name: user.name || null } : null,
      artist: artist
        ? { status: artist.status || 'pending', name: artist.name || null, kycStatus: kycStateOf(artist) }
        : null,
      organizer: organizer
        ? { status: organizer.status || 'pending', name: organizer.name || null, kycStatus: kycStateOf(organizer) }
        : null,
    },
    restrictions: {},
  };

  const found: [AppRole, any][] = [
    ['user', user],
    ['artist', artist],
    ['organizer', organizer],
  ];
  for (const [role, doc] of found) {
    if (!doc) continue;
    if (accountStatusOf(doc) === 'active') {
      result.roles.push(role);
    } else {
      result.restrictions[role] =
        (await restrictionFor(db, ROLE_COLLECTION[role], phone)) || 'This account is restricted. Please contact Mookalaa support.';
    }
  }
  return result;
}

/**
 * The 403 message when the phone may not sign in, or null.
 *   with a role     only that role's account is looked at
 *   without a role  refused only when every account the phone has is restricted
 */
export function signInRefusal(found: PhoneProfiles, role?: AppRole | null): string | null {
  if (role) return found.restrictions[role] || null;
  const restricted = Object.values(found.restrictions);
  return restricted.length > 0 && found.roles.length === 0 ? restricted[0] || null : null;
}

/* ------------------------------------------------------------------ */
/* KYC (shared by the organizer and artist routes)                     */
/* ------------------------------------------------------------------ */

export const MAX_KYC_IMAGE_BYTES = 1.5 * 1024 * 1024;

/** GET /api/{organizer|artist}/kyc-status?phone= */
export async function kycStatusResponse(db: Db, request: RequestLike, role: 'artist' | 'organizer', rawPhone: unknown) {
  const auth = requireAppUser(request, rawPhone);
  if (!auth.ok) return auth.response;

  const doc = await db.collection(ROLE_COLLECTION[role]).findOne(
    { phone: auth.phone },
    { projection: { kycStatus: 1, rejectionNotes: 1, aadharId: 1, panId: 1, kycCorrectionRequested: 1, kycSubmittedAt: 1 } }
  );
  if (!doc) return deny(role === 'artist' ? 'Artist not found' : 'Organizer not found', 404);

  return NextResponse.json({
    success: true,
    kycStatus: kycStateOf(doc),
    canSubmit: canSubmitKyc(doc),
    correctionRequested: doc.kycCorrectionRequested === true,
    rejectionNotes: doc.rejectionNotes || '',
    aadharId: doc.aadharId || '',
    panId: doc.panId || '',
    submittedAt: doc.kycSubmittedAt || null,
  });
}

/**
 * POST /api/{organizer|artist}/{kyc|resubmit-kyc}
 *   { phone, aadharId, panId, aadharImage?, panImage? }
 * A submission always goes back to 'pending' for review.
 */
export async function submitKyc(
  db: Db,
  request: RequestLike & { json(): Promise<any> },
  role: 'artist' | 'organizer',
  options: { resubmit: boolean }
) {
  const body = await readBody(request);
  if (!body) return deny('Invalid request body', 400);

  const auth = requireAppUser(request, body.phone);
  if (!auth.ok) return auth.response;
  const phone = auth.phone;

  const aadharId = text(body.aadharId, 30);
  const panId = text(body.panId, 30);
  if (!aadharId || !panId) return deny('Phone, Aadhar ID, and PAN ID are required', 400);

  const aadharImage = imageText(body.aadharImage);
  const panImage = imageText(body.panImage);
  for (const [label, image] of [['Aadhaar', aadharImage], ['PAN', panImage]] as const) {
    if (base64Bytes(image) > MAX_KYC_IMAGE_BYTES) {
      return deny(`The ${label} image is too large. Please upload a photo smaller than 1.5 MB.`, 413);
    }
  }

  const collection = db.collection(ROLE_COLLECTION[role]);
  const existing = await collection.findOne(
    { phone },
    { projection: { status: 1, kycStatus: 1, kycCorrectionRequested: 1 } }
  );
  if (!existing) return deny(role === 'artist' ? 'Artist not found' : 'Organizer not found', 404);
  if (!phoneVerified(existing)) return deny(UNVERIFIED_ERROR, 403);

  const restricted = await restrictionFor(db, ROLE_COLLECTION[role], phone);
  if (restricted) return deny(restricted, 403);

  if (existing.kycStatus === 'approved') {
    return deny('KYC is already approved. Contact Mookalaa support to change your documents.', 409);
  }

  const now = new Date();
  const set: Record<string, any> = {
    aadharId,
    panId,
    kycStatus: 'pending',
    kycCorrectionRequested: false,
    rejectionNotes: '',
    kycSubmittedAt: now,
    updatedAt: now,
  };
  if (aadharImage) set.aadharImage = aadharImage;
  if (panImage) set.panImage = panImage;
  // The organiser signup ends with KYC, which is what marks the profile finished.
  if (role === 'organizer' && !options.resubmit) set.status = 'profile_completed';

  await collection.updateOne({ phone }, { $set: set });

  return NextResponse.json({
    success: true,
    message: options.resubmit ? 'KYC documents resubmitted successfully' : 'KYC documents submitted successfully',
    kycStatus: 'pending',
  });
}

/* ------------------------------------------------------------------ */
/* Artist / organiser signup (shared by the two pairs of routes)       */
/* ------------------------------------------------------------------ */

const FINISHED = ['verified', 'completed', 'profile_completed'];

/**
 * POST /api/{organizer|artist}/register   { phone }
 * Creates or resumes the role profile for a phone.
 *   with an app token for the phone   ownership is already proven: the profile
 *       is created (or moved on from 'pending') as 'verified' and no code is
 *       sent. Response: { success, verified: true }.
 *   without a token (transition mode only)   a code is sent and the profile is
 *       left 'pending' until /{role}/verify-otp succeeds, as before.
 * A finished profile answers { success: true, alreadyRegistered: true }.
 */
export async function registerRoleProfile(
  db: Db,
  request: RequestLike & { json(): Promise<any> },
  role: 'artist' | 'organizer'
) {
  const body = await readBody(request);
  if (!body) return deny('Invalid request body', 400);

  const auth = requireAppUser(request, body.phone);
  if (!auth.ok) return auth.response;
  const phone = auth.phone;

  const collection = db.collection(ROLE_COLLECTION[role]);
  const restricted = await restrictionFor(db, ROLE_COLLECTION[role], phone);
  if (restricted) return deny(restricted, 403);

  const existing = await collection.findOne({ phone }, { projection: { status: 1 } });
  if (existing && FINISHED.includes(existing.status)) {
    return NextResponse.json({
      success: true,
      alreadyRegistered: true,
      message: 'This phone number is already registered',
      status: existing.status,
    });
  }

  const now = new Date();

  if (!auth.legacy) {
    if (existing) {
      await collection.updateOne({ phone }, { $set: { status: 'verified', updatedAt: now }, $unset: { otp: 1 } });
    } else {
      await collection.insertOne({ phone, status: 'verified', createdAt: now, updatedAt: now });
    }
    return NextResponse.json({
      success: true,
      verified: true,
      message: 'Phone number verified',
      ...(existing ? { resumed: true } : {}),
    });
  }

  const sent = await requestOtp(db, { phone, purpose: `${role}-register`, role, request });
  if (!sent.ok) return otpFailure(sent);

  if (existing) {
    await collection.updateOne({ phone }, { $set: { updatedAt: now }, $unset: { otp: 1 } });
  } else {
    await collection.insertOne({ phone, status: 'pending', createdAt: now });
  }

  return NextResponse.json({
    success: true,
    message: sent.message,
    ...(existing ? { resumed: true } : {}),
    ...(sent.devMode ? { devMode: true } : {}),
  });
}

/**
 * POST /api/{organizer|artist}/verify-otp   { phone, otp }
 * Finishes the phone check for a role profile started through register. An app
 * token for the phone is accepted in place of `otp`. Returns `token`.
 */
export async function verifyRoleProfile(
  db: Db,
  request: RequestLike & { json(): Promise<any> },
  role: 'artist' | 'organizer'
) {
  const body = await readBody(request);
  if (!body) return deny('Invalid request body', 400);

  const phone = normalisePhone(body.phone);
  if (!phone) return deny(PHONE_ERROR, 400);

  const collection = db.collection(ROLE_COLLECTION[role]);

  const proof = await proveOwnership(db, request, { phone, otp: body.otp, role });
  if (!proof.ok) return proof.response;

  const restricted = await restrictionFor(db, ROLE_COLLECTION[role], phone);
  if (restricted) return deny(restricted, 403);

  const profile = await collection.findOne({ phone }, { projection: { status: 1 } });
  if (!profile) return deny('Invalid phone number', 400);

  if (!FINISHED.includes(profile.status)) {
    await collection.updateOne({ phone }, { $set: { status: 'verified', updatedAt: new Date() }, $unset: { otp: 1 } });
  }

  return NextResponse.json({
    success: true,
    message: 'OTP verified successfully',
    token: issueAppToken(phone),
    ...(proof.devMode ? { devMode: true } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* Artist media                                                        */
/* ------------------------------------------------------------------ */

export const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
export const MEDIA_TOO_LARGE =
  'This file is too large. Photos up to 3 MB can be uploaded. Videos cannot be uploaded yet: they need a file store, which is not set up.';

export function mediaTypeOf(value: unknown): 'image' | 'video' | null {
  return value === 'image' || value === 'video' ? value : null;
}
