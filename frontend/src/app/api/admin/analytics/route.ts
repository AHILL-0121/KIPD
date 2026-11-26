import { NextResponse } from 'next/server';
import { and, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bills, bookings, menuItems, orders, payments, platformAuditLog, refunds, rooms, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePlatformAdmin();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      [payAll],
      [refAll],
      payByKind30d,
      [booking30d],
      [order30d],
      [billSettled30d],
      allActiveTenants,
      roomCounts,
      menuCounts,
      orderCounts,
      recentAudit,
    ] = await Promise.all([
      db.select({ s: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments),
      db.select({ s: sql<string>`coalesce(sum(${refunds.amount}), 0)` }).from(refunds),
      db
        .select({
          kind: bills.kind,
          total: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        })
        .from(payments)
        .innerJoin(bills, eq(payments.billId, bills.id))
        .where(gte(payments.createdAt, thirtyDaysAgo))
        .groupBy(bills.kind),
      db.select({ n: count() }).from(bookings).where(gte(bookings.createdAt, thirtyDaysAgo)),
      db.select({ n: count() }).from(orders).where(gte(orders.createdAt, thirtyDaysAgo)),
      db.select({ n: count() }).from(bills).where(and(eq(bills.status, 'paid'), gte(bills.settledAt, thirtyDaysAgo))),
      db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          type: tenants.type,
          plan: tenants.plan,
          ownerEmail: tenants.ownerEmail,
          createdAt: tenants.createdAt,
        })
        .from(tenants)
        .where(and(eq(tenants.status, 'active'), isNull(tenants.deletedAt), lte(tenants.createdAt, sevenDaysAgo)))
        .orderBy(desc(tenants.createdAt)),
      db.select({ tenantId: rooms.tenantId, n: count() }).from(rooms).groupBy(rooms.tenantId),
      db.select({ tenantId: menuItems.tenantId, n: count() }).from(menuItems).groupBy(menuItems.tenantId),
      db.select({ tenantId: orders.tenantId, n: count() }).from(orders).groupBy(orders.tenantId),
      db.select().from(platformAuditLog).orderBy(desc(platformAuditLog.createdAt)).limit(10),
    ]);

    const roomMap = new Map(roomCounts.map((r) => [r.tenantId, Number(r.n)]));
    const menuMap = new Map(menuCounts.map((m) => [m.tenantId, Number(m.n)]));
    const orderMap = new Map(orderCounts.map((o) => [o.tenantId, Number(o.n)]));

    const stalledTenants = allActiveTenants.filter(
      (t) =>
        (roomMap.get(t.id) ?? 0) === 0 &&
        (menuMap.get(t.id) ?? 0) === 0 &&
        (orderMap.get(t.id) ?? 0) === 0,
    );

    const allTenants = await db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug }).from(tenants);
    const tenantLookup = new Map(allTenants.map((t) => [t.id, t]));

    let stayGmv30d = 0;
    let restaurantGmv30d = 0;
    for (const row of payByKind30d) {
      if (row.kind === 'stay') stayGmv30d += Number(row.total ?? 0);
      else restaurantGmv30d += Number(row.total ?? 0);
    }

    return NextResponse.json({
      gmv: {
        allTimeNet: Math.max(0, Number(payAll?.s ?? 0) - Number(refAll?.s ?? 0)),
        stay30d: stayGmv30d,
        restaurant30d: restaurantGmv30d,
        total30d: stayGmv30d + restaurantGmv30d,
      },
      activity30d: {
        bookingsCreated: Number(booking30d?.n ?? 0),
        ordersCreated: Number(order30d?.n ?? 0),
        billsSettled: Number(billSettled30d?.n ?? 0),
      },
      stalledTenants,
      recentActivity: recentAudit.map((l) => {
        const t = l.targetId ? tenantLookup.get(l.targetId) : undefined;
        return {
          ...l,
          tenantName: t?.name ?? (l.metadata as Record<string, unknown> | null)?.tenantName ?? null,
        };
      }),
    });
  } catch (error) {
    return handleError(error, 'Failed to fetch platform analytics');
  }
}
