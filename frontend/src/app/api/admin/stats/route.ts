import { NextResponse } from 'next/server';
import { count, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';

/** Monthly price per plan, in USD. Plan names are enforced by the database (basic, pro, enterprise). */
const PLAN_PRICE: Record<string, number> = { basic: 49, pro: 149, enterprise: 399 };

export async function GET() {
  try {
    await requirePlatformAdmin();

    // One grouped query instead of loading every tenant. Deleted tenants are ignored.
    const rows = await db
      .select({ plan: tenants.plan, status: tenants.status, n: count() })
      .from(tenants)
      .where(isNull(tenants.deletedAt))
      .groupBy(tenants.plan, tenants.status);

    let totalTenants = 0, activeTenants = 0, suspendedTenants = 0, mrr = 0;
    for (const r of rows) {
      totalTenants += r.n;
      if (r.status === 'active') {
        activeTenants += r.n;
        mrr += (PLAN_PRICE[r.plan] ?? 0) * r.n; // only paying (active) tenants count towards revenue
      }
      if (r.status === 'suspended') suspendedTenants += r.n;
    }
    return NextResponse.json({ totalTenants, activeTenants, suspendedTenants, mrr });
  } catch (error) {
    return handleError(error, 'Failed to load platform stats');
  }
}

export const dynamic = 'force-dynamic';
