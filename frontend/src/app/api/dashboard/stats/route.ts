import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { properties, rooms, bookings, orders, outlets } from '@/db/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Get tenant context from user's Clerk metadata
    const context = await requireTenantContext();
    const { tenantId } = context;

    // Get all properties for this tenant
    const tenantProperties = await db.query.properties.findMany({
      where: eq(properties.tenantId, tenantId),
    });

    if (tenantProperties.length === 0) {
      // No properties yet - return empty stats
      return NextResponse.json({
        occupancyRate: 0,
        totalRooms: 0,
        occupiedRooms: 0,
        todayCheckIns: 0,
        todayCheckOuts: 0,
        activeOrders: 0,
        todayRevenue: 0,
        weekRevenue: 0,
        arrivals: [],
        recentOrders: [],
        hasProperties: false,
      });
    }

    const propertyIds = tenantProperties.map(p => p.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all rooms for occupancy calculation
    const allRooms = await db.query.rooms.findMany({
      where: inArray(rooms.propertyId, propertyIds),
    });

    const occupiedRooms = allRooms.filter(r => r.status === 'occupied').length;
    const totalRooms = allRooms.length;
    const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : '0';

    // Get today's check-ins
    const todayCheckIns = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.propertyId, propertyIds),
        gte(bookings.checkInDate, today),
        lte(bookings.checkInDate, tomorrow)
      ),
      with: {
        guest: true,
        room: {
          with: {
            roomType: true,
          },
        },
      },
    });

    // Get today's check-outs
    const todayCheckOuts = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.propertyId, propertyIds),
        gte(bookings.checkOutDate, today),
        lte(bookings.checkOutDate, tomorrow)
      ),
    });

    // Get all outlets for this tenant's properties
    const tenantOutlets = await db.query.outlets.findMany({
      where: inArray(outlets.propertyId, propertyIds),
    });

    const outletIds = tenantOutlets.map(o => o.id);

    // Get active orders
    let activeOrders: any[] = [];
    if (outletIds.length > 0) {
      activeOrders = await db.query.orders.findMany({
        where: and(
          inArray(orders.outletId, outletIds),
          inArray(orders.status, ['new', 'acknowledged', 'preparing'])
        ),
      });
    }

    // Calculate today's revenue
    const todayBookings = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.propertyId, propertyIds),
        gte(bookings.createdAt, today)
      ),
    });

    let todayOrders: any[] = [];
    if (outletIds.length > 0) {
      todayOrders = await db.query.orders.findMany({
        where: and(
          inArray(orders.outletId, outletIds),
          gte(orders.createdAt, today)
        ),
      });
    }

    const todayRevenue = 
      todayBookings.reduce((sum, b) => sum + Number(b.totalAmount), 0) +
      todayOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    // Calculate week revenue (last 7 days)
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekBookings = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.propertyId, propertyIds),
        gte(bookings.createdAt, weekAgo)
      ),
    });

    let weekOrders: any[] = [];
    if (outletIds.length > 0) {
      weekOrders = await db.query.orders.findMany({
        where: and(
          inArray(orders.outletId, outletIds),
          gte(orders.createdAt, weekAgo)
        ),
      });
    }

    const weekRevenue = 
      weekBookings.reduce((sum, b) => sum + Number(b.totalAmount), 0) +
      weekOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    return NextResponse.json({
      occupancyRate: Number(occupancyRate),
      totalRooms,
      occupiedRooms,
      todayCheckIns: todayCheckIns.length,
      todayCheckOuts: todayCheckOuts.length,
      activeOrders: activeOrders.length,
      todayRevenue,
      weekRevenue,
      arrivals: todayCheckIns.slice(0, 5), // First 5 for preview
      recentOrders: activeOrders.slice(0, 5),
      hasProperties: true,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
