import crypto from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238, SHA-1, 6 digits, 30 second step),
 * compatible with Google Authenticator, Microsoft Authenticator and Authy.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  const buffer = crypto.randomBytes(bytes);
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let secret = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) secret += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return secret;
}

function base32ToBuffer(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) bits += ALPHABET.indexOf(char).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpAt(secret: string, timeMs = Date.now()): string {
  const counter = Math.floor(timeMs / 1000 / 30);
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  message.writeUInt32BE(counter % 0x100000000, 4);

  const hmac = crypto.createHmac('sha1', base32ToBuffer(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, '0');
}

/* ------------------------------------------------------------------ */
/* Recovery codes                                                      */
/* ------------------------------------------------------------------ */

export const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Ten single-use codes such as "K7M2Q-9XPRD" (50 random bits each). Shown once; only hashes are stored. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  while (codes.length < count) {
    let code = '';
    for (let i = 0; i < 10; i++) code += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    const formatted = code.slice(0, 5) + '-' + code.slice(5);
    if (!codes.includes(formatted)) codes.push(formatted);
  }
  return codes;
}

/** Upper case, without spaces or dashes: what is hashed and compared. */
export function normaliseRecoveryCode(code: string): string {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** A recovery code is ten letters and digits; an authenticator code is six digits. */
export function looksLikeRecoveryCode(code: string): boolean {
  const clean = normaliseRecoveryCode(code);
  return clean.length === 10 && !/^\d{6}$/.test(String(code || '').replace(/\s/g, ''));
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update('mookalaa-recovery:' + normaliseRecoveryCode(code)).digest('hex');
}

/** What is stored on the admin account: hashes only, each with its own "used" mark. */
export function recoveryCodeRecords(codes: string[]) {
  return codes.map((code) => ({ hash: hashRecoveryCode(code), usedAt: null as Date | null }));
}

/** Accepts the current code and the ones just before and after it, to allow for clock drift. */
export function verifyTotp(secret: string, code: string): boolean {
  const candidate = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(candidate)) return false;

  for (const drift of [-1, 0, 1]) {
    const expected = totpAt(secret, Date.now() + drift * 30_000);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return true;
  }
  return false;
}

export function otpauthUri(secret: string, account: string, issuer = 'Mookalaa Admin'): string {
  return (
    'otpauth://totp/' +
    encodeURIComponent(issuer + ':' + account) +
    '?secret=' +
    secret +
    '&issuer=' +
    encodeURIComponent(issuer) +
    '&algorithm=SHA1&digits=6&period=30'
  );
}
