import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { razorpayAccounts } from '@/db/schema';
import { open, seal } from '@/lib/secret-box';
import type { RazorpayKeys } from '@/lib/razorpay';

/**
 * Each business connects its OWN Razorpay account in Settings > Payments. Payment links and QR codes are created with
 * that business's keys, so the money settles to its own bank account, and its webhook has its own address and secret.
 * Secrets are decrypted only here, on the server, at the moment they are used.
 */
export interface RazorpayAccount extends RazorpayKeys {
  /** Null until the owner has generated one. */
  webhookSecret: string | null;
}

/** What Settings may show: never a secret. */
export interface RazorpayStatus {
  connected: boolean;
  keyId: string | null;
  mode: 'test' | 'live' | null;
  /** A webhook secret exists. Until Razorpay is given it, a paid link cannot mark the bill paid. */
  webhookReady: boolean;
  webhookPath: string;
}

export const webhookPath = (tenantId: string) => `/api/webhooks/razorpay/${tenantId}`;

async function row(tenantId: string) {
  const [found] = await db.select().from(razorpayAccounts).where(eq(razorpayAccounts.tenantId, tenantId)).limit(1);
  return found;
}

/** The business's keys, ready to use, or null when it has none (or they can no longer be opened). */
export async function getRazorpayAccount(tenantId: string): Promise<RazorpayAccount | null> {
  const found = await row(tenantId);
  if (!found) return null;
  const keySecret = open(found.keySecretEnc, tenantId);
  if (!keySecret) {
    console.error('Stored Razorpay key could not be opened for tenant', tenantId);
    return null;
  }
  return { keyId: found.keyId, keySecret, webhookSecret: open(found.webhookSecretEnc, tenantId) };
}

export async function getRazorpayStatus(tenantId: string): Promise<RazorpayStatus> {
  const account = await getRazorpayAccount(tenantId);
  return {
    connected: !!account,
    keyId: account?.keyId ?? null,
    mode: account ? (account.keyId.startsWith('rzp_live_') ? 'live' : 'test') : null,
    webhookReady: !!account?.webhookSecret,
    webhookPath: webhookPath(tenantId),
  };
}

/** Online payments work only with keys AND a webhook secret: without the webhook, a paid bill would never show as paid. */
export async function razorpayReady(tenantId: string): Promise<boolean> {
  const account = await getRazorpayAccount(tenantId);
  return !!account?.webhookSecret;
}

/** Saves (or replaces) the keys. An existing webhook secret is kept, so Razorpay's dashboard does not need touching again. */
export async function saveRazorpayKeys(tenantId: string, keys: RazorpayKeys, updatedBy: string) {
  const values = { keyId: keys.keyId, keySecretEnc: seal(keys.keySecret, tenantId), updatedBy, updatedAt: new Date() };
  await db.insert(razorpayAccounts).values({ tenantId, ...values })
    .onConflictDoUpdate({ target: razorpayAccounts.tenantId, set: values });
}

/**
 * Makes a new webhook secret and returns it ONCE, for the owner to paste into Razorpay's dashboard. It cannot be read
 * back later; generating again replaces it (the old one stops working at once). Null when no keys are saved yet.
 */
export async function newWebhookSecret(tenantId: string, updatedBy: string): Promise<string | null> {
  const secret = randomBytes(32).toString('base64url');
  const rows = await db.update(razorpayAccounts)
    .set({ webhookSecretEnc: seal(secret, tenantId), updatedBy, updatedAt: new Date() })
    .where(eq(razorpayAccounts.tenantId, tenantId))
    .returning({ tenantId: razorpayAccounts.tenantId });
  return rows[0] ? secret : null;
}

export async function removeRazorpayAccount(tenantId: string) {
  await db.delete(razorpayAccounts).where(eq(razorpayAccounts.tenantId, tenantId));
}
