import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { assertUuid, handleError, notFound } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Lets a guest watch their order. The order id is an unguessable random value, and the table must match
 * too, and only orders the guest placed themselves (source = guest) can be read this way.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await enforceRateLimit(request, 'pub-order-status', 120, 60);
    const id = assertUuid(params.id, 'Order');
    const tableId = assertUuid(request.nextUrl.searchParams.get('table'), 'Order');

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, id), eq(orders.tableId, tableId), eq(orders.source, 'guest')),
      with: { orderItems: { with: { menuItem: true } } },
    });
    if (!order) throw notFound('Order');

    return NextResponse.json({
      status: order.status,
      createdAt: order.createdAt,
      total: Number(order.totalAmount),
      items: order.orderItems.map((i) => ({ name: i.menuItem?.name ?? 'Item', quantity: i.quantity })),
    });
  } catch (error) {
    return handleError(error, 'Could not load the order');
  }
}
