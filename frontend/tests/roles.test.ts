import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as menu from '@/app/api/menu/route';
import * as rooms from '@/app/api/rooms/route';
import * as orders from '@/app/api/orders/route';
import * as orderById from '@/app/api/orders/[id]/route';
import * as settle from '@/app/api/orders/settle-tab/route';
import * as bookings from '@/app/api/bookings/route';
import * as billing from '@/app/api/billing/route';
import * as kds from '@/app/api/kds/[outletId]/route';
import * as sse from '@/app/api/sse/kds/[outletId]/route';
import * as staffList from '@/app/api/staff/route';
import * as staffDirect from '@/app/api/staff/direct/route';
import { call, ids, loginAs, resetAndSeed, staffIds, personas, type Persona } from './helpers/harness';
import { testDb } from './helpers/db';
import { staff } from '@/db/schema';

const A = ids.A;
const validOrder = { tableId: A.table, items: [{ menuItemId: A.item, quantity: 1 }] };
const newStaff = (role: string, extra: object = {}) => ({ name: 'New Person', email: 'new@a.test', role, password: 'a-long-password-1', ...extra });

/**
 * Who may do what, enforced on the server. Before this, only the sidebar hid links:
 * a kitchen user could create staff accounts or edit prices by calling the API directly.
 */
type Case = { who: Persona; label: string; expected: number; run: () => Promise<{ status: number }> };

const cases: Case[] = [
  // kitchen
  { who: 'kitchenA', label: 'edit the menu', expected: 403, run: () => call(menu.PATCH, 'PATCH', '/api/menu', { body: { menuItemId: A.item, name: 'x' } }) },
  { who: 'kitchenA', label: 'create staff accounts', expected: 403, run: () => call(staffDirect.POST, 'POST', '/api/staff/direct', { body: newStaff('manager') }) },
  { who: 'kitchenA', label: 'place orders', expected: 403, run: () => call(orders.POST, 'POST', '/api/orders', { body: validOrder }) },
  { who: 'kitchenA', label: 'change room status', expected: 403, run: () => call(rooms.PATCH, 'PATCH', '/api/rooms', { body: { roomId: A.room, status: 'cleaning' } }) },
  { who: 'kitchenA', label: 'see bills', expected: 403, run: () => call(billing.GET, 'GET', '/api/billing') },
  { who: 'kitchenA', label: 'see bookings', expected: 403, run: () => call(bookings.GET, 'GET', '/api/bookings') },
  { who: 'kitchenA', label: 'see the menu', expected: 200, run: () => call(menu.GET, 'GET', '/api/menu') },
  { who: 'kitchenA', label: 'update an order status', expected: 200, run: () => call(orderById.PATCH, 'PATCH', `/api/orders/${A.order}`, { params: { id: A.order }, body: { status: 'preparing' } }) },
  { who: 'kitchenA', label: 'see the kitchen display', expected: 200, run: () => call(kds.GET, 'GET', `/api/kds/${A.outlet}`, { params: { outletId: A.outlet } }) },
  // waiter
  { who: 'waiterA', label: 'place an order', expected: 200, run: () => call(orders.POST, 'POST', '/api/orders', { body: validOrder }) },
  { who: 'waiterA', label: 'settle a table', expected: 200, run: () => call(settle.POST, 'POST', '/api/orders/settle-tab', { body: { tableId: A.table } }) },
  { who: 'waiterA', label: 'edit the menu', expected: 403, run: () => call(menu.PATCH, 'PATCH', '/api/menu', { body: { menuItemId: A.item, name: 'x' } }) },
  { who: 'waiterA', label: 'change room status', expected: 403, run: () => call(rooms.PATCH, 'PATCH', '/api/rooms', { body: { roomId: A.room, status: 'cleaning' } }) },
  { who: 'waiterA', label: 'mark a bill paid', expected: 403, run: () => call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId: A.bill, paymentMethod: 'cash' } }) },
  { who: 'waiterA', label: 'list staff', expected: 403, run: () => call(staffList.GET, 'GET', '/api/staff') },
  // front desk
  { who: 'frontA', label: 'change room status', expected: 200, run: () => call(rooms.PATCH, 'PATCH', '/api/rooms', { body: { roomId: A.room, status: 'cleaning' } }) },
  { who: 'frontA', label: 'rename a room (structural edit)', expected: 403, run: () => call(rooms.PATCH, 'PATCH', '/api/rooms', { body: { roomId: A.room, roomNumber: '999' } }) },
  { who: 'frontA', label: 'see bookings', expected: 200, run: () => call(bookings.GET, 'GET', '/api/bookings') },
  { who: 'frontA', label: 'see bills', expected: 200, run: () => call(billing.GET, 'GET', '/api/billing') },
  { who: 'frontA', label: 'mark a bill paid', expected: 200, run: () => call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId: A.bill, paymentMethod: 'cash' } }) },
  { who: 'frontA', label: 'add a menu item', expected: 403, run: () => call(menu.POST, 'POST', '/api/menu', { body: { name: 'n', price: 5, categoryId: A.category } }) },
  { who: 'frontA', label: 'place an order', expected: 403, run: () => call(orders.POST, 'POST', '/api/orders', { body: validOrder }) },
  // manager
  { who: 'managerA', label: 'edit the menu', expected: 200, run: () => call(menu.PATCH, 'PATCH', '/api/menu', { body: { menuItemId: A.item, name: 'Renamed' } }) },
  { who: 'managerA', label: 'list staff', expected: 200, run: () => call(staffList.GET, 'GET', '/api/staff') },
  { who: 'managerA', label: 'create a waiter account', expected: 200, run: () => call(staffDirect.POST, 'POST', '/api/staff/direct', { body: newStaff('waiter') }) },
  { who: 'managerA', label: 'create an OWNER account', expected: 400, run: () => call(staffDirect.POST, 'POST', '/api/staff/direct', { body: newStaff('owner') }) },
  { who: 'managerA', label: 'create an account with a weak password', expected: 400, run: () => call(staffDirect.POST, 'POST', '/api/staff/direct', { body: newStaff('waiter', { password: 'short' }) }) },
  // owner
  { who: 'ownerA', label: 'create a manager account', expected: 200, run: () => call(staffDirect.POST, 'POST', '/api/staff/direct', { body: newStaff('manager') }) },
  { who: 'ownerA', label: 'do everything a front desk can', expected: 200, run: () => call(bookings.GET, 'GET', '/api/bookings') },
];

describe('role permissions', () => {
  beforeEach(resetAndSeed);
  for (const c of cases) {
    it(`${c.who} ${c.expected === 200 ? 'can' : 'cannot'} ${c.label} (${c.expected})`, async () => {
      loginAs(c.who);
      expect((await c.run()).status).toBe(c.expected);
    });
  }
});

describe('not signed in', () => {
  beforeEach(resetAndSeed);

  const routes: [string, () => Promise<{ status: number }>][] = [
    ['GET /api/menu', () => call(menu.GET, 'GET', '/api/menu')],
    ['POST /api/menu', () => call(menu.POST, 'POST', '/api/menu', { body: { name: 'n', price: 5, categoryId: A.category } })],
    ['GET /api/rooms', () => call(rooms.GET, 'GET', '/api/rooms')],
    ['GET /api/orders', () => call(orders.GET, 'GET', '/api/orders')],
    ['POST /api/orders', () => call(orders.POST, 'POST', '/api/orders', { body: validOrder })],
    ['GET /api/bookings', () => call(bookings.GET, 'GET', '/api/bookings')],
    ['GET /api/billing', () => call(billing.GET, 'GET', '/api/billing')],
    ['GET /api/staff', () => call(staffList.GET, 'GET', '/api/staff')],
    ['POST /api/staff/direct', () => call(staffDirect.POST, 'POST', '/api/staff/direct', { body: newStaff('waiter') })],
    ['GET /api/kds/[outletId]', () => call(kds.GET, 'GET', `/api/kds/${A.outlet}`, { params: { outletId: A.outlet } })],
    ['GET /api/sse/kds/[outletId]', () => call(sse.GET, 'GET', `/api/sse/kds/${A.outlet}`, { params: { outletId: A.outlet } })],
  ];
  for (const [name, run] of routes) {
    it(`${name} returns 401`, async () => {
      loginAs(null);
      expect((await run()).status).toBe(401);
    });
  }
});

describe('platform admin has no tenant', () => {
  beforeEach(resetAndSeed);
  it('is refused on tenant routes instead of crashing on an empty tenant id', async () => {
    loginAs('platformAdmin');
    expect((await call(menu.GET, 'GET', '/api/menu')).status).toBe(403);
    expect((await call(orders.GET, 'GET', '/api/orders')).status).toBe(403);
  });
});

describe('per-person area access', () => {
  beforeEach(resetAndSeed);

  it('front desk with hotel area can access hotel routes but not restaurant routes', async () => {
    await testDb.update(staff).set({ areas: 'hotel' }).where(eq(staff.id, staffIds.frontA));
    loginAs('frontA');

    // hotel routes allowed
    expect((await call(rooms.GET, 'GET', '/api/rooms')).status).toBe(200);
    expect((await call(bookings.GET, 'GET', '/api/bookings')).status).toBe(200);

    // restaurant routes refused
    expect((await call(orders.GET, 'GET', '/api/orders')).status).toBe(403);
    expect((await call(billing.GET, 'GET', '/api/billing?kind=restaurant')).status).toBe(403);
  });

  it('front desk with restaurant area can access restaurant orders but not hotel rooms', async () => {
    await testDb.update(staff).set({ areas: 'restaurant' }).where(eq(staff.id, staffIds.frontA));
    loginAs('frontA');

    expect((await call(orders.GET, 'GET', '/api/orders')).status).toBe(200);
    expect((await call(rooms.GET, 'GET', '/api/rooms')).status).toBe(403);
    expect((await call(bookings.GET, 'GET', '/api/bookings')).status).toBe(403);
  });

  it('waiter with hotel area cannot access restaurant orders', async () => {
    await testDb.update(staff).set({ areas: 'hotel' }).where(eq(staff.id, staffIds.waiterA));
    loginAs('waiterA');

    expect((await call(orders.GET, 'GET', '/api/orders')).status).toBe(403);
  });

  it('waiter with both or restaurant area can access restaurant orders', async () => {
    await testDb.update(staff).set({ areas: 'restaurant' }).where(eq(staff.id, staffIds.waiterA));
    loginAs('waiterA');
    expect((await call(orders.GET, 'GET', '/api/orders')).status).toBe(200);

    await testDb.update(staff).set({ areas: 'both' }).where(eq(staff.id, staffIds.waiterA));
    loginAs('waiterA');
    expect((await call(orders.GET, 'GET', '/api/orders')).status).toBe(200);
  });

  it('owner and manager always bypass area restrictions', async () => {
    loginAs('ownerA');
    expect((await call(rooms.GET, 'GET', '/api/rooms')).status).toBe(200);
    expect((await call(orders.GET, 'GET', '/api/orders')).status).toBe(200);

    loginAs('managerA');
    expect((await call(rooms.GET, 'GET', '/api/rooms')).status).toBe(200);
    expect((await call(orders.GET, 'GET', '/api/orders')).status).toBe(200);
  });
});

describe('single source of truth for role and tenant', () => {
  beforeEach(resetAndSeed);

  it('staff table is the source of truth for role even when Clerk metadata exists', async () => {
    // personas.ownerA has tenant_id in Clerk metadata.
    // Insert a staff row for personas.ownerA saying role is 'waiter':
    await testDb.insert(staff).values({
      id: '00000000-0000-4000-8000-000000000199',
      tenantId: ids.A.tenant,
      clerkId: personas.ownerA,
      email: 'owner@a.test',
      name: 'Owner A Staff Row',
      role: 'waiter',
      areas: 'both',
      isActive: true,
    });

    loginAs('ownerA');
    // As a waiter, cannot list staff (only owner/manager can)
    expect((await call(staffList.GET, 'GET', '/api/staff')).status).toBe(403);

    // Update staff table to manager:
    await testDb.update(staff).set({ role: 'manager' }).where(eq(staff.clerkId, personas.ownerA));
    loginAs('ownerA'); // clears authCache
    expect((await call(staffList.GET, 'GET', '/api/staff')).status).toBe(200);
  });
});
