/**
 * Redaction for the controlled data export. Everything that leaves through the
 * export passes through redactDocument(), whatever collection it came from.
 */

/** Keys that hold credentials: passwords, OTPs, tokens, 2FA secrets, gateway and provider secrets. */
const SECRET_KEY = /password|passwd|passcode|secret|otp|token|twofactor|two_factor|totp|api[_-]?key|auth[_-]?key|credential|private[_-]?key|session|^sid$|hash$/i;

/** Keys that hold Aadhaar or PAN numbers or their images. */
const IDENTITY_KEY = /aa?dh?aa?r|^pan(id|image|number|no|card|_.*)?$/i;

/** Keys that hold images and other uploads. */
const BULKY_KEY = /image|photo|banner|logo|avatar|attachment|picture|^(media|files?|documents?)$/i;

/** In the settings collection anything that could be a key or credential is dropped. */
const SETTINGS_KEY = /key|secret|token|password|sid|auth|credential|salt/i;

/** A PAN number written inside free text (five letters, four digits, one letter). */
const PAN_IN_TEXT = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

const MAX_STRING = 10_000;
const MAX_STRING_IN_UPLOAD = 300;

export interface RedactionCount {
  secrets: number;
  identity: number;
  uploads: number;
}

export const REDACTION_SUMMARY = [
  'Passwords and password hashes, including admin passwords and event scanner-staff passwords',
  'Two-factor secrets, OTP codes, session ids and tokens',
  'Aadhaar and PAN numbers and their images',
  'The payment gateway key and secret and every other provider key in settings',
  'Profile pictures, banners, media and every other embedded image or upload',
];

function redactValue(value: any, collection: string, insideUpload: boolean, count: RedactionCount, depth: number): any {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    // Inside an image or upload field only a short link or path is kept; embedded content never is.
    const embedded = insideUpload && (value.length > MAX_STRING_IN_UPLOAD || !/^(https?:\/\/|\/)/i.test(value));
    if (value.startsWith('data:') || value.length > MAX_STRING || (embedded && value.length > 0)) {
      count.uploads++;
      return undefined;
    }
    return value.replace(PAN_IN_TEXT, () => {
      count.identity++;
      return '[PAN removed]';
    });
  }
  if (typeof value !== 'object') return value;
  if (typeof value.toHexString === 'function') return String(value); // ObjectId
  if (Buffer.isBuffer(value) || value._bsontype === 'Binary') {
    count.uploads++;
    return undefined;
  }
  if (depth > 8) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, collection, insideUpload, count, depth + 1)).filter((item) => item !== undefined);
  }

  const out: Record<string, any> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || (collection === 'settings' && SETTINGS_KEY.test(key))) {
      count.secrets++;
      continue;
    }
    if (IDENTITY_KEY.test(key)) {
      count.identity++;
      continue;
    }
    const cleaned = redactValue(inner, collection, insideUpload || BULKY_KEY.test(key), count, depth + 1);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

/** Returns a copy of the document that is safe to export. */
export function redactDocument(doc: any, collection: string, count: RedactionCount): any {
  return redactValue(doc, collection, false, count, 0);
}
