/**
 * HS256 JWT verification that runs in the Edge runtime (middleware), where the
 * `jsonwebtoken` package is not available. It checks the signature and the
 * expiry, and returns the payload only when both are valid.
 */

const DEV_SECRET = 'mookalaa-local-development-secret';

/**
 * The signing secret. In production a missing JWT_SECRET returns null, which
 * makes every token invalid: the panel fails closed instead of falling back
 * to a value that is written in the source code.
 */
export function getJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length >= 16) return secret;
  if (process.env.NODE_ENV !== 'production') return secret || DEV_SECRET;
  return null;
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function verifyTokenEdge(token: string | undefined | null): Promise<Record<string, any> | null> {
  if (!token) return null;
  const secret = getJwtSecret();
  if (!secret) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts;

    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerPart)));
    if (header.alg !== 'HS256') return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret) as unknown as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signaturePart) as unknown as BufferSource,
      new TextEncoder().encode(headerPart + '.' + payloadPart) as unknown as BufferSource
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart)));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;

    return payload;
  } catch {
    return null;
  }
}
