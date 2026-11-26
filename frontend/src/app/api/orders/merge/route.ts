import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, badRequest, handleError, parseJson } from '@/lib/http';
import { ownedOrder, ownedTable } from '@/lib/tenant-scope';
import { broadcastOrderUpdate } from '@/lib/realtime';
import { writeTenantAudit } from '@/lib/audit';

const mergeSchema = z.union([
  z.object({
    sourceTableId: z.string().uuid(),
    targetTableId: z.string().uuid(),
  }),
  z.object({
    sourceOrderId: z.string().uuid(),
    targetOrderId: z.string().uuid(),
  }),
]);

/**
 * Merges an active table's open orders onto another table (or merges two open orders directly).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenant([...ROLES.orders, 'front_desk', 'cashier'], 'restaurant');
    const { tenantId } = ctx;
    const body = await parseJson(request, mergeSchema);

    if ('sourceTableId' in body) {
      if (body.sourceTableId === body.targetTableId) {
        throw badRequest('Choose two different tables to merge.');
      }

      const [sourceTable, targetTable] = await Promise.all([
        ownedTable(tenantId, body.sourceTableId),
        ownedTable(tenantId, body.targetTableId),
      ]);

      if (sourceTable.outletId !== targetTable.outletId) {
        throw new HttpError(409, 'Tables from different outlets cannot be merged.');
      }

      const openFromSource = await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenantId),
            eq(orders.tableId, sourceTable.id),
            notInArray(orders.status, ['closed', 'cancelled']),
          ),
        );

      if (openFromSource.length === 0) {
        throw badRequest('Source table has no active orders to merge.');
      }

      const movedIds = openFromSource.map((o) => o.id);
      await db
        .update(orders)
        .set({ tableId: targetTable.id, updatedAt: new Date() })
        .where(and(eq(orders.tenantId, tenantId), inArray(orders.id, movedIds)));

      broadcastOrderUpdate(tenantId, {
        type: 'tables_merged',
        sourceTableId: sourceTable.id,
        targetTableId: targetTable.id,
      });

      void writeTenantAudit({
        tenantId,
        actorUserId: ctx.userId,
        actorName: ctx.userName,
        action: 'table.merge',
        targetType: 'table',
        targetId: targetTable.id,
        metadata: { sourceTableId: sourceTable.id, movedOrderIds: movedIds },
      });

      return NextResponse.json({
        success: true,
        movedOrders: movedIds.length,
        targetTableId: targetTable.id,
      });
    }

    if (body.sourceOrderId === body.targetOrderId) {
      throw badRequest('Choose two different orders to merge.');
    }

    const [sourceOrder, targetOrder] = await Promise.all([
      ownedOrder(tenantId, body.sourceOrderId),
      ownedOrder(tenantId, body.targetOrderId),
    ]);

    if (['closed', 'cancelled'].includes(sourceOrder.status) || ['closed', 'cancelled'].includes(targetOrder.status)) {
      throw new HttpError(409, 'Only active orders can be merged.');
    }
    if (sourceOrder.outletId !== targetOrder.outletId) {
      throw new HttpError(409, 'Orders from different outlets cannot be merged.');
    }

    const [sourceLines, targetLines] = await Promise.all([
      db.select().from(orderItems).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, sourceOrder.id))),
      db.select().from(orderItems).where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, targetOrder.id))),
    ]);

    const combinedPaise = [...targetLines, ...sourceLines].reduce(
      (sum, item) => sum + Math.round(Number(item.price) * 100) * item.quantity,
      0,
    );

    await db.batch([
      db
        .update(orderItems)
        .set({ orderId: targetOrder.id })
        .where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, sourceOrder.id))),
      db
        .update(orders)
        .set({ totalAmount: (combinedPaise / 100).toFixed(2), updatedAt: new Date() })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, targetOrder.id))),
      db
        .update(orders)
        .set({
          status: 'cancelled',
          totalAmount: '0.00',
          specialInstructions: `Merged into order ${targetOrder.id.slice(0, 8)}`,
          updatedAt: new Date(),
        })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, sourceOrder.id))),
    ]);

    broadcastOrderUpdate(tenantId, { type: 'order_merged', id: targetOrder.id });
    return NextResponse.json({
      success: true,
      targetOrderId: targetOrder.id,
      totalAmount: combinedPaise / 100,
    });
  } catch (error) {
    return handleError(error, 'Failed to merge tables or orders');
  }
}
