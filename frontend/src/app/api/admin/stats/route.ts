import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { and, count, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { accessRequests, payments, refunds, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { getPlanConfig } from '@/lib/platform-config';

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const sp = request.url ? new URL(request.url).searchParams : null;
    const detailed = sp?.get('detailed') === '1' || sp?.get('detailed') === 'true';
    const planConfig = await getPlanConfig();

    const rows = await db
      .select({ plan: tenants.plan, status: tenants.status, n: count() })
      .from(tenants)
      .where(isNull(tenants.deletedAt))
      .groupBy(tenants.plan, tenants.status);

    let totalTenants = 0;
    let activeTenants = 0;
    let suspendedTenants = 0;
    let mrr = 0;
    const planCounts: Record<string, number> = { basic: 0, pro: 0, enterprise: 0 };

    for (const r of rows) {
      const n = Number(r.n);
      totalTenants += n;
      if (r.plan in planCounts) planCounts[r.plan] += n;
      if (r.status === 'active') {
        activeTenants += n;
        const price =
          r.plan === 'pro'
            ? planConfig.plans.pro.monthlyPrice
            : r.plan === 'enterprise'
              ? planConfig.plans.enterprise.monthlyPrice
              : planConfig.plans.basic.monthlyPrice;
        mrr += price * n;
      }
      if (r.status === 'suspended') suspendedTenants += n;
    }

    if (!detailed) {
      return NextResponse.json({ totalTenants, activeTenants, suspendedTenants, mrr });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [[pendingReqRow], [payRow], [refRow]] = await Promise.all([
      db.select({ n: count() }).from(accessRequests).where(eq(accessRequests.status, 'pending')),
      db.select({ s: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments).where(gte(payments.createdAt, thirtyDaysAgo)),
      db.select({ s: sql<string>`coalesce(sum(${refunds.amount}), 0)` }).from(refunds).where(and(gte(refunds.createdAt, thirtyDaysAgo))),
    ]);

    let totalUsers = 0;
    try {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (secretKey) {
        const clerk = createClerkClient({ secretKey });
        const list = await clerk.users.getUserList({ limit: 1 });
        totalUsers = typeof list.totalCount === 'number' ? list.totalCount : list.data.length;
      }
    } catch {
      totalUsers = 0;
    }

    const gmv30d = Math.max(0, Number(payRow?.s ?? 0) - Number(refRow?.s ?? 0));

    return NextResponse.json({
      totalTenants,
      activeTenants,
      suspendedTenants,
      mrr,
      currency: planConfig.currency,
      totalUsers,
      planCounts,
      pendingAccessRequests: Number(pendingReqRow?.n ?? 0),
      gmv30d,
    });
  } catch (error) {
    return handleError(error, 'Failed to load platform stats');
  }
}

export const dynamic = 'force-dynamic';
