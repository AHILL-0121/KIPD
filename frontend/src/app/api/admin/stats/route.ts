import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { eq, count, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    // Get total tenants
    const [{ totalTenants }] = await db
      .select({ totalTenants: count() })
      .from(tenants);

    // Get active tenants
    const [{ activeTenants }] = await db
      .select({ activeTenants: count() })
      .from(tenants)
      .where(eq(tenants.status, 'active'));

    // Get suspended tenants
    const [{ suspendedTenants }] = await db
      .select({ suspendedTenants: count() })
      .from(tenants)
      .where(eq(tenants.status, 'suspended'));

    // Calculate MRR (simplified)
    const tenantsList = await db.query.tenants.findMany();
    const mrr = tenantsList.reduce((sum, tenant) => {
      const planPrices: Record<string, number> = {
        starter: 49,
        professional: 149,
        enterprise: 399,
      };
      return sum + (planPrices[tenant.plan] || 0);
    }, 0);

    return NextResponse.json({
      totalTenants,
      activeTenants,
      suspendedTenants,
      mrr,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
