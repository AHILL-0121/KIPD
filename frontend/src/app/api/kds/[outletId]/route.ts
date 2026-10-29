import { NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { ownedOutlet } from '@/lib/tenant-scope';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_request: Request, { params }: { params: { outletId: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.kitchen);
    // 404 unless this outlet belongs to the caller's tenant (previously any outlet id worked).
    const outlet = await ownedOutlet(tenantId, params.outletId);

    const active = await db.query.orders.findMany({
      where: and(eq(orders.outletId, outlet.id), inArray(orders.status, ['new', 'acknowledged', 'preparing'])),
      with: { table: true, room: true, orderItems: { with: { menuItem: true } } },
      orderBy: [asc(orders.createdAt)],
    });

    return NextResponse.json(active.map((order) => ({
      id: order.id,
      type: order.type,
      tableNumber: order.table?.tableNumber,
      roomNumber: order.room?.roomNumber,
      status: order.status,
      specialInstructions: order.specialInstructions,
      createdAt: order.createdAt,
      items: order.orderItems.map((item) => ({
        name: item.menuItem.name,
        quantity: item.quantity,
        notes: item.notes,
      })),
    })));
  } catch (error) {
    return handleError(error, 'Failed to fetch kitchen orders');
  }
}
