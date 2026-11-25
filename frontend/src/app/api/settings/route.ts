import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { outlets, tenants } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { getTenantPlanUsage } from '@/lib/plan-limits';
import { getSettings, propertySettingsSchema, receiptSettingsSchema } from '@/lib/property-settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Billing roles print receipts, so they may read. Outlets and plan quotas are returned alongside settings. */
export async function GET() {
  try {
    const { tenantId } = await requireTenant(ROLES.billing);
    const [settings, tenantOutlets, planInfo] = await Promise.all([
      getSettings(tenantId),
      db.select().from(outlets).where(eq(outlets.tenantId, tenantId)).orderBy(outlets.createdAt),
      getTenantPlanUsage(tenantId),
    ]);
    return NextResponse.json({ ...settings, outlets: tenantOutlets, webhooks: [], ...planInfo });
  } catch (error) {
    return handleError(error, 'Failed to fetch settings');
  }
}

/** Property settings: name, currency, check-in/out times, timezone. Owners and managers only. */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const body = await parseJson(request, z.object({ propertySettings: propertySettingsSchema }));
    const { name, timezone, ...rest } = body.propertySettings;
    await db.update(tenants)
      .set({ name, timezone, propertySettings: rest, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
    return NextResponse.json(await getSettings(tenantId));
  } catch (error) {
    return handleError(error, 'Failed to save settings');
  }
}

/** Receipt layout. Owners and managers only. */
export async function PATCH(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const body = await parseJson(request, z.object({ receiptSettings: receiptSettingsSchema }));
    await db.update(tenants).set({ receiptSettings: body.receiptSettings, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
    return NextResponse.json(await getSettings(tenantId));
  } catch (error) {
    return handleError(error, 'Failed to save receipt settings');
  }
}
