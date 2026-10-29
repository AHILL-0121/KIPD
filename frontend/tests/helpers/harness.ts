import { NextRequest } from 'next/server';
import { is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { testDb } from './db';

/* ───────── fixed ids so tests can name things ───────── */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export type Side = 'A' | 'B';

function idsFor(base: number) {
  return {
    tenant: uuid(base + 1), property: uuid(base + 2), outlet: uuid(base + 3), category: uuid(base + 4),
    item: uuid(base + 5), table: uuid(base + 6), roomType: uuid(base + 7), room: uuid(base + 8),
    guest: uuid(base + 9), booking: uuid(base + 10), order: uuid(base + 11), orderItem: uuid(base + 12),
    bill: uuid(base + 13), staff: uuid(base + 14),
  };
}
export const ids = { A: idsFor(100), B: idsFor(200) };
export const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');

/** A staff row for tenant A with a given role. Extra staff for the role tests. */
export const staffIds = {
  kitchenA: uuid(150), waiterA: uuid(151), frontA: uuid(152), managerA: uuid(153),
};

/* ───────── who is logged in ───────── */
type G = { __user?: string | null; __clerk?: Record<string, unknown>; authCache?: Map<string, unknown> };
const g = globalThis as unknown as G;

/**
 * Personas. "owner" personas have the tenant in their Clerk metadata (the app treats those as owners).
 * The others have no metadata and get their role from the staff table, like real staff do.
 */
export const personas = {
  ownerA: 'user_ownerA', ownerB: 'user_ownerB',
  managerA: 'user_managerA', frontA: 'user_frontA', waiterA: 'user_waiterA', kitchenA: 'user_kitchenA',
  platformAdmin: 'user_platform',
} as const;
export type Persona = keyof typeof personas;

export function loginAs(who: Persona | null) {
  g.__user = who ? personas[who] : null;
  g.authCache?.clear(); // the app caches roles for 60 s; tests must not see stale roles
}

/* ───────── database ───────── */
export const tables = Object.values(schema).filter((t) => is(t, PgTable)) as unknown as PgTable[];

export async function dump(): Promise<string> {
  const out: Record<string, unknown[]> = {};
  for (const t of tables) {
    const name = (t as unknown as { [k: symbol]: string })[Symbol.for('drizzle:Name')];
    const rows = await testDb.select().from(t as never);
    out[name] = (rows as Record<string, unknown>[]).map((r) => JSON.stringify(r)).sort();
  }
  return JSON.stringify(out);
}

export async function resetAndSeed() {
  const names = tables.map((t) => `"${(t as unknown as { [k: symbol]: string })[Symbol.for('drizzle:Name')]}"`).join(', ');
  await testDb.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));

  const s = schema;
  for (const side of ['A', 'B'] as Side[]) {
    const x = ids[side];
    const t = x.tenant; // every tenant-owned row carries its tenant
    await testDb.insert(s.tenants).values({ id: t, name: `Tenant ${side}`, slug: `tenant-${side.toLowerCase()}`, ownerEmail: `owner@${side.toLowerCase()}.test` });
    await testDb.insert(s.properties).values({ id: x.property, tenantId: t, name: `Property ${side}` });
    await testDb.insert(s.outlets).values({ id: x.outlet, tenantId: t, propertyId: x.property, name: `Outlet ${side}`, slug: `outlet-${side.toLowerCase()}` });
    await testDb.insert(s.menuCategories).values({ id: x.category, tenantId: t, outletId: x.outlet, name: `Category ${side}` });
    await testDb.insert(s.menuItems).values({ id: x.item, tenantId: t, outletId: x.outlet, categoryId: x.category, name: `Dish ${side}`, price: side === 'A' ? '100.00' : '250.00' });
    await testDb.insert(s.tables).values({ id: x.table, tenantId: t, outletId: x.outlet, tableNumber: `T-${side}` });
    await testDb.insert(s.roomTypes).values({ id: x.roomType, tenantId: t, propertyId: x.property, name: `Type ${side}`, basePrice: '5000.00' });
    await testDb.insert(s.rooms).values({ id: x.room, tenantId: t, propertyId: x.property, roomTypeId: x.roomType, roomNumber: `10${side === 'A' ? 1 : 2}`, status: 'available' });
    await testDb.insert(s.guests).values({ id: x.guest, tenantId: t, email: `guest@${side.toLowerCase()}.test`, name: `Guest ${side}` });
    await testDb.insert(s.bookings).values({
      id: x.booking, tenantId: t, propertyId: x.property, roomId: x.room, guestId: x.guest, status: 'confirmed',
      checkInDate: new Date('2030-01-10T12:00:00Z'), checkOutDate: new Date('2030-01-12T10:00:00Z'), totalAmount: '10000.00',
    });
    await testDb.insert(s.orders).values({ id: x.order, tenantId: t, outletId: x.outlet, tableId: x.table, status: 'new', totalAmount: '200.00' });
    await testDb.insert(s.orderItems).values({ id: x.orderItem, tenantId: t, orderId: x.order, menuItemId: x.item, quantity: 2, price: side === 'A' ? '100.00' : '250.00' });
    await testDb.insert(s.bills).values({ id: x.bill, tenantId: t, guestId: x.guest, totalAmount: side === 'A' ? '1180.00' : '777.00', status: 'open' });
    await testDb.insert(s.staff).values({ id: x.staff, tenantId: t, clerkId: `user_staff_${side}`, email: `staff@${side.toLowerCase()}.test`, name: `Staff ${side}`, role: 'waiter', isActive: true });
  }

  // Extra staff for tenant A, one per role.
  const a = ids.A.tenant;
  await testDb.insert(s.staff).values([
    { id: staffIds.kitchenA, tenantId: a, clerkId: personas.kitchenA, email: 'k@a.test', name: 'Kitchen A', role: 'kitchen', isActive: true },
    { id: staffIds.waiterA, tenantId: a, clerkId: personas.waiterA, email: 'w@a.test', name: 'Waiter A', role: 'waiter', isActive: true },
    { id: staffIds.frontA, tenantId: a, clerkId: personas.frontA, email: 'f@a.test', name: 'Front A', role: 'front_desk', isActive: true },
    { id: staffIds.managerA, tenantId: a, clerkId: personas.managerA, email: 'm@a.test', name: 'Manager A', role: 'manager', isActive: true },
  ]);

  // Clerk side: owners carry the tenant in metadata; the platform admin carries a flag.
  g.__clerk = {
    [personas.ownerA]: { publicMetadata: { tenant_id: ids.A.tenant }, firstName: 'Owner', lastName: 'A', emailAddresses: [] },
    [personas.ownerB]: { publicMetadata: { tenant_id: ids.B.tenant }, firstName: 'Owner', lastName: 'B', emailAddresses: [] },
    [personas.platformAdmin]: { publicMetadata: { platform_admin: true }, firstName: 'Platform', lastName: 'Admin', emailAddresses: [] },
  };
  loginAs(null);
}

/* ───────── calling route handlers ───────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => any;

export async function call(handler: Handler, method: string, url: string, opts: { body?: unknown; params?: Record<string, string> } = {}) {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res: Response = await handler(new NextRequest(`http://localhost${url}`, init), { params: opts.params ?? {} });
  let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = await res.clone().json(); } catch { /* not JSON (e.g. an event stream) */ }
  return { status: res.status, json, res };
}

export const q = async <T = Record<string, unknown>>(query: string): Promise<T[]> =>
  (await testDb.execute(sql.raw(query))).rows as T[];
