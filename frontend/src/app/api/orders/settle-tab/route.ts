import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, guests, orders } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { badRequest, handleError, parseJson } from '@/lib/http';
import { broadcastOrderUpdate } from '@/lib/realtime';
import { ownedTable } from '@/lib/tenant-scope';

const schema = z.object({
  tableId: z.string().uuid(),
  paymentMethod: z.enum(['cash', 'upi']).optional(),
});

const GST_HALF = 0.025; // 2.5% CGST + 2.5% SGST. Hard-coded for now (checklist section 7).

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenant(ROLES.billing);
    const { tenantId } = context;
    const { tableId } = await parseJson(request, schema);

    // The table must belong to this tenant. Everything below hangs off it.
    const table = await ownedTable(tenantId, tableId);

    const openOrders = await db.query.orders.findMany({
      where: and(eq(orders.tenantId, tenantId), eq(orders.tableId, table.id), notInArray(orders.status, ['cancelled', 'closed'])),
      with: { orderItems: { with: { menuItem: true } } },
    });
    if (openOrders.length === 0) throw badRequest('No active tickets on this table to settle.');

    // Recalculate from line items rather than trusting stored order totals.
    let subtotal = 0;
    const itemsMap = new Map<string, { qty: number; rate: number; amt: number; name: string }>();
    for (const order of openOrders) {
      for (const item of order.orderItems) {
        const rate = Number(item.price);
        const amt = rate * item.quantity;
        subtotal += amt;
        const name = item.menuItem?.name || 'Custom Item';
        const existing = itemsMap.get(name);
        if (existing) { existing.qty += item.quantity; existing.amt += amt; }
        else itemsMap.set(name, { qty: item.quantity, rate, amt, name });
      }
    }
    const cgst = Number((subtotal * GST_HALF).toFixed(2));
    const sgst = Number((subtotal * GST_HALF).toFixed(2));
    const total = Math.round(subtotal + cgst + sgst);
    const receipt = { subtotal, cgst, sgst, total, items: Array.from(itemsMap.values()) };

    // Anonymous walk-ins are billed to one placeholder guest per tenant.
    // Race-safe: the unique index on (tenant, lower(email)) means two simultaneous first-ever settles
    // cannot create two walk-in guests.
    await db.insert(guests)
      .values({ tenantId, email: 'walkin@kipd.local', name: 'Restaurant Walk-in' })
      .onConflictDoNothing();
    const walkIn = await db.query.guests.findFirst({
      where: and(eq(guests.tenantId, tenantId), eq(guests.email, 'walkin@kipd.local')),
    });
    if (!walkIn) throw badRequest('Could not prepare the walk-in guest');

    // Create the bill and close the tickets together or not at all.
    const billId = crypto.randomUUID();
    await db.batch([
      db.insert(bills).values({
        id: billId,
        tenantId,
        guestId: walkIn.id,
        totalAmount: total.toString(),
        status: 'open',
        itemsBreakdown: receipt,
        settledAt: new Date(),
      }),
      db.update(orders)
        .set({ status: 'closed', billId, updatedAt: new Date() })
        .where(and(eq(orders.tenantId, tenantId), inArray(orders.id, openOrders.map((o) => o.id)))),
    ]);

    broadcastOrderUpdate(tenantId, { type: 'bill_settled', id: billId });
    return NextResponse.json({ success: true, settledOrders: openOrders.length, status: 'sent_to_billing' });
  } catch (error) {
    return handleError(error, 'Failed to settle table tab');
  }
}
