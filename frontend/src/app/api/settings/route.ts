import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { getSettings, propertySettingsSchema, receiptSettingsSchema } from '@/lib/property-settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Billing roles print receipts, so they may read. Outlets and webhooks have no tables yet. */
export async function GET() {
  try {
    const { tenantId } = await requireTenant(ROLES.billing);
    return NextResponse.json({ ...(await getSettings(tenantId)), outlets: [], webhooks: [] });
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
