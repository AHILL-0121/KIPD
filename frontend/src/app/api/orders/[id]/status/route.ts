import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';
import { broadcastOrderUpdate } from '@/app/api/sse/kds/[outletId]/route';

export const dynamic = 'force-dynamic';

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const context = await requireTenantContext();
        const { tenantId } = context;
        const { id } = params;

        const body = await request.json();
        const { status } = body;

        if (!['new', 'acknowledged', 'preparing', 'ready', 'delivered', 'cancelled'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        // Verify order exists using its unique crypto-UUID
        const [existingOrder] = await db.query.orders.findMany({
            where: eq(orders.id, id),
        });

        if (!existingOrder) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Update status
        await db.update(orders)
            .set({
                status,
                updatedAt: new Date(),
            })
            .where(eq(orders.id, id));

        // Let the SSE engine trigger a cross-browser Live Sync on all other kitchen tablets!
        try {
            // Re-fetch with full relations for the broadcast schema
            const fullOrder = await db.query.orders.findFirst({
                where: eq(orders.id, id),
                with: {
                    table: true,
                    room: true,
                    orderItems: { with: { menuItem: true } },
                },
            });
            if (fullOrder && fullOrder.outletId) {
                const kdsOrder = {
                    id: fullOrder.id,
                    type: fullOrder.type,
                    tableNumber: fullOrder.table?.tableNumber,
                    roomNumber: fullOrder.room?.roomNumber,
                    status: fullOrder.status,
                    specialInstructions: fullOrder.specialInstructions,
                    createdAt: fullOrder.createdAt,
                    items: fullOrder.orderItems.map((oi: any) => ({
                        name: oi.menuItem?.name || 'Unknown Item',
                        quantity: oi.quantity,
                        notes: oi.notes,
                    })),
                };
                broadcastOrderUpdate(fullOrder.outletId, kdsOrder);
                broadcastOrderUpdate(tenantId, kdsOrder); // Fire globally
            }
        } catch (ignored) { }

        return NextResponse.json({ success: true, status });
    } catch (error) {
        console.error('Update order status error:', error);
        return NextResponse.json(
            { error: 'Failed to update order status' },
            { status: 500 }
        );
    }
}
