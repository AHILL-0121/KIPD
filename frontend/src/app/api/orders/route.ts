import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, menuItems, outlets, properties } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;
    const body = await request.json();
    const { tableId, roomId, type, items: orderItemsData, specialInstructions } = body;

    // Get tenant outlets
    const tenantProperties = await db.query.properties.findMany({
      where: eq(properties.tenantId, tenantId),
    });
    if (tenantProperties.length === 0) {
      return NextResponse.json({ error: 'No property found' }, { status: 404 });
    }
    const propertyIds = tenantProperties.map(p => p.id);
    const tenantOutlets = await db.query.outlets.findMany({
      where: inArray(outlets.propertyId, propertyIds),
    });
    if (tenantOutlets.length === 0) {
      return NextResponse.json({ error: 'No outlet found' }, { status: 404 });
    }
    const outletId = tenantOutlets[0].id;

    // Calculate total
    let totalAmount = 0;
    for (const item of orderItemsData) {
      const menuItem = await db.query.menuItems.findFirst({
        where: eq(menuItems.id, item.menuItemId),
      });
      if (menuItem) {
        totalAmount += Number(menuItem.price) * item.quantity;
      }
    }

    // Create order
    const [order] = await db.insert(orders).values({
      outletId,
      tableId: tableId || null,
      roomId: roomId || null,
      type: type || (tableId ? 'dine_in' : 'room_service'),
      status: 'new',
      totalAmount: totalAmount.toString(),
      specialInstructions: specialInstructions || null,
    }).returning();

    // Create order items
    for (const item of orderItemsData) {
      const menuItem = await db.query.menuItems.findFirst({
        where: eq(menuItems.id, item.menuItemId),
      });
      if (menuItem) {
        await db.insert(orderItems).values({
          orderId: order.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          price: menuItem.price,
          notes: item.notes || null,
        });
      }
    }

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error) {
    console.error('Order creation error:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    // Get all properties for this tenant
    const tenantProperties = await db.query.properties.findMany({
      where: eq(properties.tenantId, tenantId),
    });

    if (tenantProperties.length === 0) {
      return NextResponse.json([]);
    }

    const propertyIds = tenantProperties.map(p => p.id);

    // Get all outlets for these properties
    const tenantOutlets = await db.query.outlets.findMany({
      where: inArray(outlets.propertyId, propertyIds),
    });

    if (tenantOutlets.length === 0) {
      return NextResponse.json([]);
    }

    const outletIds = tenantOutlets.map(o => o.id);

    const allOrders = await db.query.orders.findMany({
      where: inArray(orders.outletId, outletIds),
      with: {
        orderItems: {
          with: {
            menuItem: true,
          },
        },
        table: true,
      },
      orderBy: (orders, { desc }) => [desc(orders.createdAt)],
    });

    return NextResponse.json(allOrders);
  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
