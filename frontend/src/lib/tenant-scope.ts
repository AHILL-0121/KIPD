import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  bills, bookings, menuCategories, menuItems, orders, outlets, properties, roomTypes, rooms, tables,
} from '@/db/schema';
import { assertUuid, notFound } from '@/lib/http';

/**
 * Tenant scoping.
 *
 * Every tenant-owned table has its own `tenant_id`, so ownership is one equality check:
 *
 *   db.update(menuItems).set(x).where(and(eq(menuItems.id, id), eq(menuItems.tenantId, tenantId)))
 *
 * The same statement checks ownership and writes, so there is no read-then-write gap. A row from
 * another tenant simply matches nothing. The database backs this up with composite foreign keys
 * (tenant_id, parent_id), so a child row cannot point at another tenant's parent even if this code
 * were wrong. Both layers are tested in tests/tenant-isolation.test.ts and tests/integrity.test.ts.
 */

async function first<T>(rows: T[], what: string): Promise<T> {
  if (!rows[0]) throw notFound(what);
  return rows[0];
}

export async function ownedCategory(tenantId: string, id: unknown) {
  assertUuid(id, 'Category');
  return first(await db.select().from(menuCategories)
    .where(and(eq(menuCategories.id, id as string), eq(menuCategories.tenantId, tenantId))).limit(1), 'Category');
}

export async function ownedTable(tenantId: string, id: unknown) {
  assertUuid(id, 'Table');
  return first(await db.select().from(tables)
    .where(and(eq(tables.id, id as string), eq(tables.tenantId, tenantId))).limit(1), 'Table');
}

export async function ownedRoomType(tenantId: string, id: unknown) {
  assertUuid(id, 'Room type');
  return first(await db.select().from(roomTypes)
    .where(and(eq(roomTypes.id, id as string), eq(roomTypes.tenantId, tenantId))).limit(1), 'Room type');
}

export async function ownedRoom(tenantId: string, id: unknown) {
  assertUuid(id, 'Room');
  return first(await db.select().from(rooms)
    .where(and(eq(rooms.id, id as string), eq(rooms.tenantId, tenantId))).limit(1), 'Room');
}

export async function ownedBooking(tenantId: string, id: unknown) {
  assertUuid(id, 'Booking');
  return first(await db.select().from(bookings)
    .where(and(eq(bookings.id, id as string), eq(bookings.tenantId, tenantId))).limit(1), 'Booking');
}

export async function ownedOrder(tenantId: string, id: unknown) {
  assertUuid(id, 'Order');
  return first(await db.select().from(orders)
    .where(and(eq(orders.id, id as string), eq(orders.tenantId, tenantId))).limit(1), 'Order');
}

export async function ownedBill(tenantId: string, id: unknown) {
  assertUuid(id, 'Bill');
  return first(await db.select().from(bills)
    .where(and(eq(bills.id, id as string), eq(bills.tenantId, tenantId))).limit(1), 'Bill');
}

export async function ownedOutlet(tenantId: string, id: unknown) {
  assertUuid(id, 'Outlet');
  return first(await db.select().from(outlets)
    .where(and(eq(outlets.id, id as string), eq(outlets.tenantId, tenantId))).limit(1), 'Outlet');
}

/** The tenant's first outlet / property, for flows that do not name one (QR-less orders, new categories). */
export async function firstOutlet(tenantId: string) {
  return (await db.select().from(outlets).where(eq(outlets.tenantId, tenantId)).orderBy(outlets.createdAt).limit(1))[0];
}
export async function firstProperty(tenantId: string) {
  return (await db.select().from(properties).where(eq(properties.tenantId, tenantId)).orderBy(properties.createdAt).limit(1))[0];
}

/** Menu items for these ids, restricted to the tenant. Missing ids simply don't come back. */
export async function ownedMenuItems(tenantId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(menuItems).where(and(inArray(menuItems.id, ids), eq(menuItems.tenantId, tenantId)));
}
