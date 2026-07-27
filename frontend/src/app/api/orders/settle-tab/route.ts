import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const context = await requireTenantContext();
        const body = await request.json();
        const { tableId, paymentMethod } = body;

        if (!tableId) {
            return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });
        }

        // A real POS would generate a 'Bill' record here.
        // Since our bills table strictly requires a Hotel Booking guest_id, 
        // for this restaurant 'Walk-In' POS flow, we will simply close the active tickets.
        // Future Expansion: Create a 'Walk-in' guest profile to map the revenue formally.

        // Get all open orders for this table
        const openOrders = await db.query.orders.findMany({
            where: and(
                eq(orders.tableId, tableId),
                ne(orders.status, 'cancelled'),
                ne(orders.status, 'served')
            )
        });

        if (openOrders.length === 0) {
            return NextResponse.json({ error: 'No active tickets on this table to settle.' }, { status: 400 });
        }

        // Mark all open orders natively as 'served' (Archived / Closed)
        for (const order of openOrders) {
            await db.update(orders)
                .set({ status: 'served', updatedAt: new Date() })
                .where(eq(orders.id, order.id));
        }

        // If paymentMethod === 'upi', we would theoretically bridge to our UPIListenerService here!

        return NextResponse.json({ success: true, settledOrders: openOrders.length, paymentMethod });
    } catch (error) {
        console.error('Settle Tab Error:', error);
        return NextResponse.json({ error: 'Failed to settle table tab' }, { status: 500 });
    }
}
