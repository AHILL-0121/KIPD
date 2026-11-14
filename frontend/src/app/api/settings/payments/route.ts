import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { getPaymentSettings, paymentSettingsSchema } from '@/lib/payment-settings';
import { getRazorpayStatus } from '@/lib/razorpay-account';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Anyone who takes payments needs to know which ways are allowed, so billing roles may read. */
export async function GET() {
  try {
    const { tenantId, role } = await requireTenant(ROLES.billing);
    const settings = await getPaymentSettings(tenantId);
    const status = await getRazorpayStatus(tenantId);
    // `razorpayConfigured` says whether this business can take online payments, never what its keys are.
    // The connection details (key id, webhook address) are for owners and managers only.
    return NextResponse.json({
      ...settings,
      razorpayConfigured: status.connected && status.webhookReady,
      ...((ROLES.manage as string[]).includes(role) ? { razorpay: status } : {}),
    });
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
    const status = await getRazorpayStatus(tenantId);
    return NextResponse.json({ ...settings, razorpayConfigured: status.connected && status.webhookReady, razorpay: status });
  } catch (error) {
    return handleError(error, 'Failed to save payment settings');
  }
}
