import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';

/** Printed on restaurant and stay bills. Uppercased by the settings page, kept short so it fits a receipt. */
export const receiptSettingsSchema = z.object({
  header: z.string().trim().max(60).default('KIPD RESTAURANT'),
  subtext: z.string().trim().max(80).default('GST INVOICE • WALK-IN'),
  footer: z.string().trim().max(80).default('WE ARE HAPPY TO SERVE YOU'),
});
export type ReceiptSettings = z.infer<typeof receiptSettingsSchema>;
export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = receiptSettingsSchema.parse({});

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const validZone = (z0: string) => { try { new Intl.DateTimeFormat('en', { timeZone: z0 }); return true; } catch { return false; } };

/** What the Property Settings card edits. name and timezone live in their own tenants columns. */
export const propertySettingsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
  checkInTime: time,
  checkOutTime: time,
  timezone: z.string().refine(validZone, 'Unknown timezone'),
});
export type PropertySettings = z.infer<typeof propertySettingsSchema>;

/** The part stored in tenants.property_settings (jsonb). {} means defaults. */
const storedPropertySchema = propertySettingsSchema.pick({ currency: true, checkInTime: true, checkOutTime: true }).partial();

export function parseReceiptSettings(stored: unknown): ReceiptSettings {
  const parsed = receiptSettingsSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : DEFAULT_RECEIPT_SETTINGS;
}

export async function getSettings(tenantId: string) {
  const [row] = await db.select({
    name: tenants.name, timezone: tenants.timezone, property: tenants.propertySettings, receipt: tenants.receiptSettings,
  }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const stored = storedPropertySchema.safeParse(row?.property ?? {});
  const p = stored.success ? stored.data : {};
  const propertySettings: PropertySettings = {
    name: row?.name ?? '',
    timezone: row?.timezone ?? 'Asia/Kolkata',
    currency: p.currency ?? 'INR',
    checkInTime: p.checkInTime ?? '14:00',
    checkOutTime: p.checkOutTime ?? '11:00',
  };
  return { propertySettings, receiptSettings: parseReceiptSettings(row?.receipt) };
}
