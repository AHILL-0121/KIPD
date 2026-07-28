import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, bills, payments, guests } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';
import { broadcastOrderUpdate } from '@/app/api/sse/kds/[outletId]/route';

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

        // Get all unpaid orders for this table (including 'served' food that hasn't been billed yet)
        const openOrders = await db.query.orders.findMany({
            where: and(
                eq(orders.tableId, tableId),
                ne(orders.status, 'cancelled'),
                ne(orders.status, 'closed')
            ),
            with: {
                orderItems: {
                    with: { menuItem: true }
                }
            }
        });

        if (openOrders.length === 0) {
            return NextResponse.json({ error: 'No active tickets on this table to settle.' }, { status: 400 });
        }

        // 1. Calculate Tab Total & Condense the Order Items for the Receipt!
        let subtotalAmount = 0;
        const itemsMap = new Map<string, { qty: number; rate: number; amt: number; name: string }>();

        for (const order of openOrders) {
            // Because order.totalAmount might not precisely match our raw items if someone modified the DB, we recalculate from raw to be strictly legally safe.
            for (const item of order.orderItems) {
                const rate = Number(item.price);
                const amt = rate * item.quantity;
                subtotalAmount += amt;

                const name = item.menuItem?.name || 'Custom Item';
                if (itemsMap.has(name)) {
                    const existing = itemsMap.get(name)!;
                    existing.qty += item.quantity;
                    existing.amt += amt;
                } else {
                    itemsMap.set(name, { qty: item.quantity, rate, amt, name });
                }
            }
        }

        // Compute Indian Taxes (2.5% CGST + 2.5% SGST)
        const cgst = Number((subtotalAmount * 0.025).toFixed(2));
        const sgst = Number((subtotalAmount * 0.025).toFixed(2));
        const totalAmount = Math.round(subtotalAmount + cgst + sgst); // Round to nearest Indian Rupee

        // Build the physical structured payload for the Thermal Printer
        const receiptBreakdown = {
            subtotal: subtotalAmount,
            cgst,
            sgst,
            total: totalAmount,
            items: Array.from(itemsMap.values())
        };

        // 2. We need a Guest account to legally map the Bill! Since they are anonymous walk-ins, we generate/fetch a dummy profile natively.
        let walkInGuest = await db.query.guests.findFirst({
            where: and(
                eq(guests.tenantId, context.tenantId),
                eq(guests.email, 'walkin@kipd.local')
            )
        });

        if (!walkInGuest) {
            const [newWalkIn] = await db.insert(guests)
                .values({
                    tenantId: context.tenantId,
                    email: 'walkin@kipd.local',
                    name: 'Restaurant Walk-in'
                })
                .returning();
            walkInGuest = newWalkIn;
        }

        // 3. Generate Formal OPEN Invoice in global Billing Engine for the Front Desk!
        // We do NOT log a payment yet. This formally hands the ticket over to the Cashier!
        const [newBill] = await db.insert(bills)
            .values({
                guestId: walkInGuest.id,
                totalAmount: totalAmount.toString(),
                status: 'open',
                itemsBreakdown: receiptBreakdown,
                settledAt: new Date()
                // No paidAmount, no paidAt, no payments log!
            })
            .returning();

        // 5. Finalize Front Desk Handoff: Mark POS orders as 'closed', attaching them to the final Bill, erasing them from Waiter iPad
        for (const order of openOrders) {
            await db.update(orders)
                .set({ status: 'closed', billId: newBill.id, updatedAt: new Date() })
                .where(eq(orders.id, order.id));
        }

        // Fire global network ping to physically re-render the Dashboards and Waiter iPads!
        try {
            broadcastOrderUpdate(context.tenantId, { type: 'bill_settled', id: newBill.id });
        } catch (skip) { }

        return NextResponse.json({ success: true, settledOrders: openOrders.length, status: 'sent_to_billing' });
    } catch (error) {
        console.error('Settle Tab Error:', error);
        return NextResponse.json({ error: 'Failed to settle table tab' }, { status: 500 });
    }
}
