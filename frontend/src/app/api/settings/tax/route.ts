import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { taxSettingsSchema } from '@/lib/gst';
import { getTaxSettings } from '@/lib/tax-settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** The front desk issues invoices, so the roles that do may read what goes on them. */
export async function GET() {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    return NextResponse.json(await getTaxSettings(tenantId));
  } catch (error) {
    return handleError(error, 'Failed to load tax settings');
  }
}

/**
 * Only owners and managers change the tax profile. It applies to bills opened from now on: bills already open keep
 * the tax they were opened with, and invoices already issued never change.
 */
export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const settings = await parseJson(request, taxSettingsSchema);
    await db.update(tenants).set({ taxSettings: settings, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
    return NextResponse.json(settings);
  } catch (error) {
    return handleError(error, 'Failed to save tax settings');
  }
}
