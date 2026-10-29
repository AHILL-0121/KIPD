import { NextRequest, NextResponse } from 'next/server';
import { and, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { orderItems, orders, tables } from '@/db/schema';
import { HttpError, badRequest, handleError, notFound, parseJson } from '@/lib/http';
import { publishOrder } from '@/lib/order-events';
import { SLUG, resolveOutlet } from '@/lib/public';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ownedMenuItems } from '@/lib/tenant-scope';

/** A guest places an order from the table's QR code. No login, so every limit here is deliberate. */
const MAX_OPEN_GUEST_ORDERS_PER_TABLE = 3;   // orders the kitchen has not even acknowledged yet
const MAX_ORDER_TOTAL = 50_000;              // rupees: bigger than this needs a human

const schema = z.object({
  slug: z.string().regex(SLUG).max(100),
  tableId: z.string().uuid(),
  note: z.string().trim().max(200).optional(),
  website: z.string().max(0).optional(),     // honeypot: invisible to people, bots fill it in
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(20),
    notes: z.string().trim().max(120).optional(),
  })).min(1).max(25),
});

export async function POST(request: NextRequest) {
  try {
    // Per caller+table, and a looser hourly cap so one device cannot flood a kitchen.
    const body0 = await request.clone().json().catch(() => ({}));
    const tableKey = typeof body0?.tableId === 'string' ? body0.tableId.slice(0, 40) : '';
    await enforceRateLimit(request, 'pub-order-min', 6, 60, tableKey);
    await enforceRateLimit(request, 'pub-order-hour', 30, 3600);

    const body = await parseJson(request, schema);
    const { outlet, tenant } = await resolveOutlet(body.slug);

    // The table must belong to this outlet. A table id from another restaurant is "not found".
    const [table] = await db.select().from(tables)
      .where(and(eq(tables.id, body.tableId), eq(tables.outletId, outlet.id), eq(tables.tenantId, tenant.id))).limit(1);
    if (!table) throw notFound('Table');

    // Do not let one table bury the kitchen in unacknowledged orders.
    const [{ open }] = await db.select({ open: count() }).from(orders).where(and(
      eq(orders.tenantId, tenant.id), eq(orders.tableId, table.id), eq(orders.source, 'guest'), inArray(orders.status, ['new', 'acknowledged']),
    ));
    if (open >= MAX_OPEN_GUEST_ORDERS_PER_TABLE) {
      throw new HttpError(429, 'Your earlier orders are still being confirmed by the kitchen. Please wait a moment, or ask a member of staff.', { 'Retry-After': '60' });
    }

    // Prices and availability come from the database. Nothing price-related is read from the request.
    const ids = [...new Set(body.items.map((i) => i.menuItemId))];
    const found = await ownedMenuItems(tenant.id, ids);
    const byId = new Map(found.map((m) => [m.id, m]));
    for (const id of ids) {
      const item = byId.get(id);
      if (!item || item.outletId !== outlet.id) throw badRequest('Something on your order is no longer on the menu. Please refresh and try again.');
      if (item.isAvailable === false) throw badRequest(`${item.name} is not available right now.`);
    }
    const paise = body.items.reduce((sum, i) => sum + Math.round(Number(byId.get(i.menuItemId)!.price) * 100) * i.quantity, 0);
    if (paise / 100 > MAX_ORDER_TOTAL) throw badRequest('That is a very large order. Please ask a member of staff to help.');

    const orderId = crypto.randomUUID();
    await db.batch([
      db.insert(orders).values({
        id: orderId, tenantId: tenant.id, outletId: outlet.id, tableId: table.id,
        type: 'dine_in', source: 'guest', status: 'new',
        totalAmount: (paise / 100).toFixed(2), specialInstructions: body.note || null,
      }),
      db.insert(orderItems).values(body.items.map((i) => ({
        tenantId: tenant.id, orderId, menuItemId: i.menuItemId, quantity: i.quantity,
        price: byId.get(i.menuItemId)!.price, notes: i.notes || null,
      }))),
    ]);

    await publishOrder(tenant.id, orderId);
    // The order id is a long random value, so it doubles as the guest's tracking link.
    return NextResponse.json({ success: true, orderId, status: 'new', total: paise / 100 }, { status: 201 });
  } catch (error) {
    return handleError(error, 'Could not place the order');
  }
}
