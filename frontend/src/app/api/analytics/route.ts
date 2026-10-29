import { NextRequest, NextResponse } from 'next/server';
import { and, count, countDistinct, desc, eq, gte, inArray, lt, ne, sql, sum } from 'drizzle-orm';
import { db } from '@/db';
import { menuCategories, menuItems, orderItems, orders, tables } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { RANGES, buildPeriod, changeText, type Range } from '@/lib/periods';

export const dynamic = 'force-dynamic';

/** Chart colours for the category split. They cycle if a restaurant has more categories than this. */
const PALETTE = ['#AE231B', '#0B6B6F', '#5E8C6A', '#78716C', '#A8A29E', '#1C1917'];

/**
 * Food and beverage analytics for the selected period, in the restaurant's own time zone.
 *
 * Definitions (so the numbers can be checked):
 * - Revenue      = value of orders that were not cancelled, before tax. Counted on the day the order was placed.
 * - Orders       = the same orders, counted.
 * - Tables used  = tables that had at least one such order in that hour/day/month, as a % of all tables.
 * - Occupancy    = tables with an order in progress right now, as a % of all tables.
 * Everything is computed by the database in a few grouped queries; no rows are loaded to be summed in code.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId, timezone } = await requireTenant(ROLES.manage);
    const asked = request.nextUrl.searchParams.get('range') as Range;
    const range: Range = RANGES.includes(asked) ? asked : 'week';
    const period = buildPeriod(range, timezone);

    const live = and(eq(orders.tenantId, tenantId), ne(orders.status, 'cancelled'));
    const within = (from: Date, to: Date) => and(live, gte(orders.createdAt, from), lt(orders.createdAt, to));
    const bucket = sql<string>`to_char(date_trunc(${period.sqlUnit}, ${orders.createdAt} AT TIME ZONE ${timezone}), ${period.sqlFormat})`;
    const lineValue = sql`${orderItems.price} * ${orderItems.quantity}`;

    const [series, [current], [previous], [tableCount], [inUse], top, byCategory] = await Promise.all([
      db.select({ key: bucket, revenue: sum(orders.totalAmount), orders: count(), tables: countDistinct(orders.tableId) })
        .from(orders).where(within(period.start, period.end)).groupBy(sql`1`), // by position: the bucket expression carries bind parameters, which Postgres will not match twice
      db.select({ revenue: sum(orders.totalAmount), orders: count() }).from(orders).where(within(period.start, period.end)),
      db.select({ revenue: sum(orders.totalAmount) }).from(orders).where(within(period.prevStart, period.prevEnd)),
      db.select({ n: count() }).from(tables).where(eq(tables.tenantId, tenantId)),
      db.select({ n: countDistinct(orders.tableId) }).from(orders).where(and(
        eq(orders.tenantId, tenantId), inArray(orders.status, ['new', 'acknowledged', 'preparing', 'ready', 'served']),
      )),
      db.select({ name: menuItems.name, quantity: sum(orderItems.quantity), revenue: sum(lineValue) })
        .from(orderItems)
        .innerJoin(orders, and(eq(orders.id, orderItems.orderId), eq(orders.tenantId, orderItems.tenantId)))
        .innerJoin(menuItems, and(eq(menuItems.id, orderItems.menuItemId), eq(menuItems.tenantId, orderItems.tenantId)))
        .where(within(period.start, period.end))
        .groupBy(menuItems.id, menuItems.name).orderBy(desc(sum(lineValue))).limit(5),
      db.select({ name: menuCategories.name, value: sum(lineValue) })
        .from(orderItems)
        .innerJoin(orders, and(eq(orders.id, orderItems.orderId), eq(orders.tenantId, orderItems.tenantId)))
        .innerJoin(menuItems, and(eq(menuItems.id, orderItems.menuItemId), eq(menuItems.tenantId, orderItems.tenantId)))
        .innerJoin(menuCategories, and(eq(menuCategories.id, menuItems.categoryId), eq(menuCategories.tenantId, menuItems.tenantId)))
        .where(within(period.start, period.end))
        .groupBy(menuCategories.id, menuCategories.name).orderBy(desc(sum(lineValue))),
    ]);

    const totalTables = tableCount.n;
    const byKey = new Map(series.map((r) => [r.key, r]));
    const num = (v: string | null | undefined) => Number(v ?? 0);
    const revenue = num(current.revenue), orderCount = current.orders;

    return NextResponse.json({
      revenue,
      revenueChange: changeText(revenue, num(previous.revenue)),
      occupancy: totalTables ? Number(((inUse.n / totalTables) * 100).toFixed(1)) : 0,
      occupancyNote: totalTables ? `${inUse.n} of ${totalTables} tables in use now` : 'No tables set up yet',
      guests: orderCount, // the screen labels this "Total Orders"
      newGuests: null,
      avgOrderValue: orderCount ? Number((revenue / orderCount).toFixed(2)) : 0,
      // Every bucket is present (zero when quiet), so charts have no gaps.
      revenueData: period.buckets.map((b) => ({ date: b.label, food: num(byKey.get(b.key)?.revenue) })),
      occupancyData: period.buckets.map((b) => ({ date: b.label, rate: totalTables ? Number((((byKey.get(b.key)?.tables ?? 0) / totalTables) * 100).toFixed(1)) : 0 })),
      categoryBreakdown: byCategory.map((c, i) => ({ name: c.name, value: num(c.value), color: PALETTE[i % PALETTE.length] })),
      topItems: top.map((t) => ({ name: t.name, orders: num(t.quantity), revenue: num(t.revenue) })),
    });
  } catch (error) {
    return handleError(error, 'Failed to fetch analytics');
  }
}
