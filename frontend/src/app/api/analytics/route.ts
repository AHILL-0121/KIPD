import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings, orders, bills, properties, outlets, tables } from '@/db/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'week';

    // Get all properties for this tenant
    const tenantProperties = await db.query.properties.findMany({
      where: eq(properties.tenantId, tenantId),
    });

    if (tenantProperties.length === 0) {
      return NextResponse.json({
        revenue: 0,
        revenueChange: null,
        occupancy: 0,
        occupancyNote: null,
        guests: 0,
        newGuests: null,
        avgOrderValue: 0,
        occupancyData: [],
        revenueData: [],
        categoryBreakdown: [],
        topItems: []
      });
    }

    const propertyIds = tenantProperties.map(p => p.id);

    // Get all outlets for these properties
    const tenantOutlets = await db.query.outlets.findMany({
      where: inArray(outlets.propertyId, propertyIds),
    });

    const outletIds = tenantOutlets.map(o => o.id);

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (range) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Get F&B revenue & orders
    let ordersRevenue = 0;
    let recentOrders: any[] = [];
    if (outletIds.length > 0) {
      recentOrders = await db.query.orders.findMany({
        where: and(
          inArray(orders.outletId, outletIds),
          gte(orders.createdAt, startDate)
        ),
      });

      ordersRevenue = recentOrders.reduce(
        (sum, o) => sum + Number(o.totalAmount),
        0
      );
    }

    // Calculate table occupancy
    let tableOccupancyRate = 0;
    if (outletIds.length > 0) {
      const tablesList = await db.query.tables.findMany({
        where: inArray(tables.outletId, outletIds)
      });

      if (tablesList.length > 0) {
        // Count active orders currently occupying tables
        const activeTableOrders = await db.query.orders.findMany({
          where: and(
            inArray(orders.outletId, outletIds),
            inArray(orders.status, ['new', 'acknowledged', 'preparing', 'ready', 'served'])
          )
        });
        const occupiedTableIds = new Set(activeTableOrders.filter(o => o.tableId).map(o => o.tableId));
        tableOccupancyRate = (occupiedTableIds.size / tablesList.length) * 100;
      }
    }

    return NextResponse.json({
      revenue: ordersRevenue,
      revenueChange: null,
      occupancy: tableOccupancyRate.toFixed(1),
      guests: recentOrders.length, // representing Total Orders now
      avgOrderValue: recentOrders.length > 0 ? (ordersRevenue / recentOrders.length) : 0,
      occupancyData: [],
      revenueData: [],
      categoryBreakdown: [],
      topItems: []
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
