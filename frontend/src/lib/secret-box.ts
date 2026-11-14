import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { HttpError } from '@/lib/http';

/**
 * Encrypts small secrets (a business's payment keys) before they go into the database, with AES-256-GCM.
 *
 * - The key comes from the PAYMENT_KEYS_SECRET environment variable (any random string of 32+ characters).
 *   It lives only on the server, so a copy of the database alone does not reveal anyone's keys.
 * - `context` (the tenant id) is bound into every value: a value copied onto another business's row will not open.
 * - Losing or changing PAYMENT_KEYS_SECRET makes every stored value unreadable. Businesses then re-enter their keys.
 */
const VERSION = 'v1';

function key(): Buffer {
  const secret = process.env.PAYMENT_KEYS_SECRET;
  if (!secret || secret.length < 32) {
    throw new HttpError(503, 'Payment keys cannot be stored yet: the server is missing its encryption secret. Please contact support.');
  }
  return createHash('sha256').update(secret).digest();
}

export const secretBoxReady = () => (process.env.PAYMENT_KEYS_SECRET ?? '').length >= 32;

export function seal(plain: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** The original text, or null when it cannot be opened (wrong server secret, wrong business, or a damaged value). */
export function open(sealed: string | null | undefined, context: string): string | null {
  if (!sealed) return null;
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || body === undefined) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
