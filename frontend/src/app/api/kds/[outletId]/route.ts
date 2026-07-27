import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, tables, rooms, menuItems } from '@/db/schema';
import { eq, inArray, and, not } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
    request: Request,
    { params }: { params: { outletId: string } }
) {
    try {
        const { outletId } = params;

        // Fetch active orders for this outlet
        const activeOrders = await db.query.orders.findMany({
            where: and(
                eq(orders.outletId, outletId),
                inArray(orders.status, ['new', 'acknowledged', 'preparing'])
            ),
            with: {
                table: true,
                room: true,
                orderItems: {
                    with: {
                        menuItem: true,
                    },
                },
            },
            orderBy: (orders, { asc }) => [asc(orders.createdAt)],
        });

        // Formatting for the KDS frontend
        const formattedOrders = activeOrders.map((order) => ({
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
        }));

        return NextResponse.json(formattedOrders);
    } catch (error) {
        console.error('KDS Fetch error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch KDS active orders' },
            { status: 500 }
        );
    }
}
