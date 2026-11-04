import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { getPaymentSettings, paymentSettingsSchema } from '@/lib/payment-settings';
import { razorpayConfigured } from '@/lib/razorpay';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Anyone who takes payments needs to know which ways are allowed, so billing roles may read. */
export async function GET() {
  try {
    const { tenantId } = await requireTenant(ROLES.billing);
    const settings = await getPaymentSettings(tenantId);
    // `razorpayConfigured` says whether the server has keys, never what they are.
    return NextResponse.json({ ...settings, razorpayConfigured: razorpayConfigured() });
  } catch (error) {
    return handleError(error, 'Failed to load payment settings');
  }
}

/** Only owners and managers change how the property takes payments. */
export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const settings = await parseJson(request, paymentSettingsSchema);
    await db.update(tenants).set({ paymentSettings: settings, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
    return NextResponse.json({ ...settings, razorpayConfigured: razorpayConfigured() });
  } catch (error) {
    return handleError(error, 'Failed to save payment settings');
  }
}
