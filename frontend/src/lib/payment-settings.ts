import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { tenants } from '@/db/schema';

/** The ways staff can record money they received. Online payment links are a separate switch. */
export const MANUAL_METHODS = ['cash', 'upi', 'card', 'bank_transfer'] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];

export const MANUAL_METHOD_LABEL: Record<ManualMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card (machine)',
  bank_transfer: 'Bank transfer',
};

/**
 * Settings > Payments. Stored as JSON on the tenant. An empty object means the defaults: every manual method,
 * no online payment links, no suggested deposit. Unknown or malformed stored values fall back to the defaults too,
 * so a bad row can never lock staff out of taking payments.
 */
export const paymentSettingsSchema = z.object({
  manualMethods: z.array(z.enum(MANUAL_METHODS)).min(1, 'Keep at least one way to record a payment').default([...MANUAL_METHODS]),
  onlinePayments: z.boolean().default(false),
  /** Suggested deposit as a percentage of the stay. 0 = no suggestion. It only pre-fills an amount; nothing is blocked. */
  depositPercent: z.number().min(0).max(100).default(0),
});
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = paymentSettingsSchema.parse({});

/** Reads stored settings, falling back to the defaults for anything missing or invalid. */
export function parsePaymentSettings(stored: unknown): PaymentSettings {
  const parsed = paymentSettingsSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : DEFAULT_PAYMENT_SETTINGS;
}

export async function getPaymentSettings(tenantId: string): Promise<PaymentSettings> {
  const [row] = await db.select({ paymentSettings: tenants.paymentSettings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return parsePaymentSettings(row?.paymentSettings);
}

export { suggestedDeposit } from '@/lib/deposit';
