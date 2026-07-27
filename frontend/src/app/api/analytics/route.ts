import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings, orders, bills, properties, outlets } from '@/db/schema';
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
        totalRevenue: 0,
        bookingsRevenue: 0,
        ordersRevenue: 0,
        occupancyRate: 0,
        totalGuests: 0,
        totalOrders: 0,
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

    // Get bookings revenue
    const recentBookings = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.propertyId, propertyIds),
        gte(bookings.createdAt, startDate)
      ),
    });

    const bookingsRevenue = recentBookings.reduce(
      (sum, b) => sum + Number(b.totalAmount),
      0
    );

    // Get F&B revenue
    let ordersRevenue = 0;
    if (outletIds.length > 0) {
      const recentOrders = await db.query.orders.findMany({
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

    // Calculate occupancy (simplified)
    const totalRooms = 0; // TODO: Get from rooms table
    const occupiedRooms = recentBookings.filter(b => b.status === 'checked_in').length;
    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    return NextResponse.json({
      totalRevenue: bookingsRevenue + ordersRevenue,
      bookingsRevenue,
      ordersRevenue,
      occupancyRate,
      totalGuests: recentBookings.length,
      totalOrders: outletIds.length > 0 ? recentBookings.length : 0,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
