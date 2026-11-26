export const IMPERSONATE_COOKIE = 'kipd_impersonate';
const IMPERSONATE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSecret(): string | null {
  return (
    process.env.IMPERSONATE_SECRET ||
    process.env.PAYMENT_KEYS_SECRET ||
    process.env.CLERK_SECRET_KEY ||
    null
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Creates a signed, expiring impersonation token: `<tenantId>.<adminClerkId>.<expiresAtMs>.<hmac>`.
 */
export async function signImpersonateToken(tenantId: string, adminClerkId: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('Impersonation secret is not configured');
  const expiresAt = Date.now() + IMPERSONATE_TTL_MS;
  const payload = `${tenantId}.${adminClerkId}.${expiresAt}`;
  const sig = await signPayload(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * Verifies signature, expiry, UUID shape, and matching platform admin user ID.
 * Returns the impersonated `tenantId` or null when invalid/expired.
 */
export async function verifyImpersonateToken(
  token: string | undefined | null,
  expectedAdminClerkId?: string,
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [tenantId, adminClerkId, expiresStr, sig] = parts;
  if (!UUID_RE.test(tenantId) || !adminClerkId || !sig) return null;
  if (expectedAdminClerkId && adminClerkId !== expectedAdminClerkId) return null;

  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const secret = getSecret();
  if (!secret) return null;
  const expectedSig = await signPayload(`${tenantId}.${adminClerkId}.${expiresStr}`, secret);
  return timingSafeEqualStr(sig, expectedSig) ? tenantId : null;
}
