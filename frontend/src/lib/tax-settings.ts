import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { parseTaxSettings, type TaxSettings } from '@/lib/gst';

export async function getTaxSettings(tenantId: string): Promise<TaxSettings> {
  const [row] = await db.select({ taxSettings: tenants.taxSettings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return parseTaxSettings(row?.taxSettings);
}
