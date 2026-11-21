import crypto from 'crypto';

/**
 * Small helper used to keep sensitive settings (such as the Razorpay key
 * secret) encrypted at rest inside MongoDB instead of being stored in clear
 * text. Values are encrypted with AES-256-GCM using a key derived from
 * SETTINGS_ENCRYPTION_KEY (preferred) or JWT_SECRET.
 */

const ENC_PREFIX = 'enc:v1:';

/** The value that was used when no secret was configured. Kept only to read old data. */
const LEGACY_SECRET = 'mookalaa-secret-key';

function keyFrom(secret: string): Buffer {
  // sha256 gives us a stable 32 byte key from an arbitrary length secret.
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function configuredSecret(): string | null {
  return process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || null;
}

function getEncryptionKey(): Buffer {
  const secret = configuredSecret();
  if (secret) return keyFrom(secret);
  if (process.env.NODE_ENV === 'production') {
    // Never encrypt new secrets with a key that is written in the source code.
    throw new Error('Set SETTINGS_ENCRYPTION_KEY (or JWT_SECRET) before saving secrets.');
  }
  return keyFrom(LEGACY_SECRET);
}

function decryptionKeys(): Buffer[] {
  const secret = configuredSecret();
  // Values saved before a key was configured can still be read once.
  return secret ? [keyFrom(secret), keyFrom(LEGACY_SECRET)] : [keyFrom(LEGACY_SECRET)];
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

export function encryptValue(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return (
    ENC_PREFIX +
    [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':')
  );
}

/**
 * Returns the decrypted value, or null when the payload cannot be decrypted
 * (for example because the encryption key changed). Values that were stored
 * before encryption was introduced are returned as-is.
 */
export function decryptValue(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!isEncrypted(value)) return value; // legacy / manually inserted plain text

  const [ivPart, tagPart, dataPart] = value.slice(ENC_PREFIX.length).split(':');
  if (!ivPart || !tagPart || !dataPart) return null;

  for (const key of decryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'));
      decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      // Wrong key: try the next one.
    }
  }

  console.error('Failed to decrypt a stored settings value with the configured key.');
  return null;
}
