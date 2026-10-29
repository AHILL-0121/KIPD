import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { assertUuid, notFound } from '@/lib/http';
import { broadcastOrderUpdate } from '@/lib/realtime';

/**
 * Statuses accepted from the UI. The two order endpoints historically disagreed
 * ('served' vs 'delivered'); both are accepted until the vocabulary is unified
 * (checklist section 5).
 */
export const ORDER_STATUS_INPUT = ['new', 'acknowledged', 'preparing', 'ready', 'served', 'delivered', 'cancelled'] as const;
export type OrderStatusInput = (typeof ORDER_STATUS_INPUT)[number];

/** Shape the kitchen display and order screens expect. */
export async function publishOrder(tenantId: string, orderId: string) {
  try {
    const full = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true, room: true, orderItems: { with: { menuItem: true } } },
    });
    if (!full) return;
    const payload = {
      id: full.id,
      type: full.type,
      tableNumber: full.table?.tableNumber,
      roomNumber: full.room?.roomNumber,
      status: full.status,
      specialInstructions: full.specialInstructions,
      createdAt: full.createdAt,
      items: full.orderItems.map((oi) => ({
        name: oi.menuItem?.name || 'Unknown Item',
        quantity: oi.quantity,
        notes: oi.notes,
      })),
    };
    broadcastOrderUpdate(full.outletId, payload);
    broadcastOrderUpdate(tenantId, payload);
  } catch (error) {
    // Realtime is best-effort; never fail the request because a broadcast failed.
    console.error('Order broadcast failed', error);
  }
}

/** Update an order's status only if it belongs to the tenant (single statement), then notify screens. */
export async function setOrderStatus(tenantId: string, id: unknown, input: OrderStatusInput) {
  assertUuid(id, 'Order');
  // 'delivered' is the old name for 'served'. The database only accepts the current vocabulary.
  const status = input === 'delivered' ? 'served' : input;
  const rows = await db
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(orders.id, id as string), eq(orders.tenantId, tenantId)))
    .returning({ id: orders.id });
  if (!rows[0]) throw notFound('Order');
  await publishOrder(tenantId, rows[0].id);
}
