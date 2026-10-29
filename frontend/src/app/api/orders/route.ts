import { NextRequest, NextResponse } from 'next/server';
import { and, eq, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { badRequest, handleError, parseJson } from '@/lib/http';
import { publishOrder } from '@/lib/order-events';
import { firstOutlet, ownedMenuItems, ownedRoom, ownedTable } from '@/lib/tenant-scope';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const createSchema = z.object({
  type: z.enum(['dine_in', 'room_service']).optional(),
  tableId: z.string().uuid().nullish(),
  roomId: z.string().uuid().nullish(),
  specialInstructions: z.string().max(500).nullish(),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
    notes: z.string().max(200).nullish(),
  })).min(1).max(60),
});

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.orders);
    const body = await parseJson(request, createSchema);

    // 1. Where does the order go? A table fixes the outlet; otherwise the tenant's first outlet.
    let outletId: string;
    if (body.tableId) {
      outletId = (await ownedTable(tenantId, body.tableId)).outletId;
    } else {
      const outlet = await firstOutlet(tenantId);
      if (!outlet) throw badRequest('No outlet found');
      outletId = outlet.id;
    }
    if (body.roomId) await ownedRoom(tenantId, body.roomId);

    // 2. Every item must be on this tenant's menu, in this outlet, and available. Prices come from the DB.
    const ids = [...new Set(body.items.map((i) => i.menuItemId))];
    const found = await ownedMenuItems(tenantId, ids);
    const byId = new Map(found.map((m) => [m.id, m]));
    for (const id of ids) {
      const item = byId.get(id);
      if (!item || item.outletId !== outletId) throw badRequest('One or more items are not on the menu for this outlet');
      if (item.isAvailable === false) throw badRequest(`${item.name} is currently unavailable`);
    }

    // 3. Total in whole paise so floats can't drift.
    const paise = body.items.reduce((sum, i) => sum + Math.round(Number(byId.get(i.menuItemId)!.price) * 100) * i.quantity, 0);

    // 4. Order and its items are written together or not at all.
    const orderId = crypto.randomUUID();
    await db.batch([
      db.insert(orders).values({
        id: orderId,
        tenantId,
        outletId,
        tableId: body.tableId ?? null,
        roomId: body.roomId ?? null,
        type: body.type ?? (body.tableId ? 'dine_in' : 'room_service'),
        status: 'new',
        totalAmount: (paise / 100).toFixed(2),
        specialInstructions: body.specialInstructions ?? null,
      }),
      db.insert(orderItems).values(body.items.map((i) => ({
        tenantId,
        orderId,
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        price: byId.get(i.menuItemId)!.price,
        notes: i.notes ?? null,
      }))),
    ]);

    await publishOrder(tenantId, orderId);
    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    return handleError(error, 'Failed to create order');
  }
}

export async function GET() {
  try {
    const { tenantId } = await requireTenant(ROLES.kitchen);
    const all = await db.query.orders.findMany({
      where: and(eq(orders.tenantId, tenantId), notInArray(orders.status, ['closed', 'cancelled'])),
      with: { orderItems: { with: { menuItem: true } }, table: true },
      orderBy: (o, { desc }) => [desc(o.createdAt)],
    });
    return NextResponse.json(all);
  } catch (error) {
    return handleError(error, 'Failed to fetch orders');
  }
}
