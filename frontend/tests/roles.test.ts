import { beforeEach, describe, expect, it } from 'vitest';
import * as menu from '@/app/api/menu/route';
import * as rooms from '@/app/api/rooms/route';
import * as orders from '@/app/api/orders/route';
import * as orderStatus from '@/app/api/orders/[id]/status/route';
import * as settle from '@/app/api/orders/settle-tab/route';
import * as bookings from '@/app/api/bookings/route';
import * as billing from '@/app/api/billing/route';
import * as kds from '@/app/api/kds/[outletId]/route';
import * as sse from '@/app/api/sse/kds/[outletId]/route';
import * as staffList from '@/app/api/staff/route';
import * as staffDirect from '@/app/api/staff/direct/route';
import * as notification from '@/app/api/payments/notification-match/route';
import { call, ids, loginAs, resetAndSeed, type Persona } from './helpers/harness';

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
  { who: 'kitchenA', label: 'update an order status', expected: 200, run: () => call(orderStatus.PATCH, 'PATCH', `/api/orders/${A.order}/status`, { params: { id: A.order }, body: { status: 'preparing' } }) },
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
    ['POST /api/payments/notification-match (was fully open)', () => call(notification.POST, 'POST', '/api/payments/notification-match', { body: { amount: 1180, packageName: 'com.phonepe.app' } })],
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
