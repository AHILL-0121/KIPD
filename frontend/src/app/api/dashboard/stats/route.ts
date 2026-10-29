import { NextResponse } from 'next/server';
import { and, count, eq, gte, inArray, lt, ne, sql, sum } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, orders, payments, properties, rooms } from '@/db/schema';
import { requireTenant } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildPeriod } from '@/lib/periods';
import { startOfDayInZone, startOfNextDayInZone } from '@/lib/tz';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * The owner's overview. All figures are for the business's own day (its time zone), computed in the database.
 *
 * - "Today / this week revenue" is money actually COLLECTED (payments received), so cancelled or unpaid
 *   orders cannot inflate it. (It used to add up every booking and order, including cancelled ones.)
 * - "This week" is the last 7 days including today.
 * - Arrivals and departures ignore cancelled bookings.
 */
export async function GET() {
  try {
    const { tenantId, timezone } = await requireTenant();

    const [{ n: propertyCount }] = await db.select({ n: count() }).from(properties).where(eq(properties.tenantId, tenantId));
    if (propertyCount === 0) {
      return NextResponse.json({
        occupancyRate: 0, totalRooms: 0, occupiedRooms: 0, todayCheckIns: 0, todayCheckOuts: 0,
        activeOrders: 0, todayRevenue: 0, weekRevenue: 0, arrivals: [], recentOrders: [], hasProperties: false,
      });
    }

    const today = startOfDayInZone(timezone);
    const tomorrow = startOfNextDayInZone(timezone);
    const weekStart = buildPeriod('week', timezone).start;
    const dayAgo = new Date(Date.now() - 24 * 3_600_000);
    const notCancelled = ne(bookings.status, 'cancelled');
    const collected = (from: Date) => db.select({ total: sum(payments.amount) }).from(payments)
      .where(and(eq(payments.tenantId, tenantId), gte(payments.createdAt, from), lt(payments.createdAt, tomorrow)));

    const [[roomStats], [checkIns], [checkOuts], [active], [todayPaid], [weekPaid], arrivals, recentOrders] = await Promise.all([
      db.select({ total: count(), occupied: sql<number>`count(*) filter (where ${rooms.status} = 'occupied')`.mapWith(Number) }).from(rooms).where(eq(rooms.tenantId, tenantId)),
      db.select({ n: count() }).from(bookings).where(and(eq(bookings.tenantId, tenantId), notCancelled, gte(bookings.checkInDate, today), lt(bookings.checkInDate, tomorrow))),
      db.select({ n: count() }).from(bookings).where(and(eq(bookings.tenantId, tenantId), notCancelled, gte(bookings.checkOutDate, today), lt(bookings.checkOutDate, tomorrow))),
      db.select({ n: count() }).from(orders).where(and(eq(orders.tenantId, tenantId), inArray(orders.status, ['new', 'acknowledged', 'preparing', 'ready', 'served']))),
      collected(today),
      collected(weekStart),
      db.query.bookings.findMany({
        where: and(eq(bookings.tenantId, tenantId), notCancelled, gte(bookings.checkInDate, today), lt(bookings.checkInDate, tomorrow)),
        with: { guest: true, room: { with: { roomType: true } } },
        orderBy: (b, { asc }) => [asc(b.checkInDate)],
        limit: 5,
      }),
      db.query.orders.findMany({
        where: and(eq(orders.tenantId, tenantId), gte(orders.createdAt, dayAgo)),
        orderBy: (o, { desc }) => [desc(o.createdAt)],
        limit: 5,
        with: { table: true, orderItems: { with: { menuItem: true } } },
      }),
    ]);

    const totalRooms = roomStats.total, occupied = roomStats.occupied;

    return NextResponse.json({
      occupancyRate: totalRooms ? Number(((occupied / totalRooms) * 100).toFixed(1)) : 0,
      totalRooms,
      occupiedRooms: occupied,
      todayCheckIns: checkIns.n,
      todayCheckOuts: checkOuts.n,
      activeOrders: active.n,
      todayRevenue: Number(todayPaid.total ?? 0),
      weekRevenue: Number(weekPaid.total ?? 0),
      arrivals,
      recentOrders,
      hasProperties: true,
    });
  } catch (error) {
    return handleError(error, 'Failed to load the dashboard');
  }
}
