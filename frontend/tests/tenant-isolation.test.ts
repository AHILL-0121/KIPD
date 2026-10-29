import { beforeEach, describe, expect, it } from 'vitest';
import * as menu from '@/app/api/menu/route';
import * as categories from '@/app/api/menu-categories/route';
import * as rooms from '@/app/api/rooms/route';
import * as roomTypes from '@/app/api/room-types/route';
import * as tablesRoute from '@/app/api/tables/route';
import * as orders from '@/app/api/orders/route';
import * as orderById from '@/app/api/orders/[id]/route';
import * as orderStatus from '@/app/api/orders/[id]/status/route';
import * as settle from '@/app/api/orders/settle-tab/route';
import * as bookings from '@/app/api/bookings/route';
import * as bookingById from '@/app/api/bookings/[id]/route';
import * as billing from '@/app/api/billing/route';
import * as kds from '@/app/api/kds/[outletId]/route';
import * as sse from '@/app/api/sse/kds/[outletId]/route';
import * as staffList from '@/app/api/staff/route';
import * as staffById from '@/app/api/staff/[id]/route';
import { call, dump, ids, loginAs, other, resetAndSeed, type Persona, type Side } from './helpers/harness';

/**
 * THE core guarantee: one tenant can never read or change another tenant's data.
 *
 * Every attack below is "tenant X's owner targets tenant Y's record by its real id".
 * Each must (1) be refused with the right status and (2) leave the ENTIRE database
 * byte-for-byte unchanged. Run in both directions (A attacks B, B attacks A).
 */
type Attack = { name: string; expectStatus: number; run: () => Promise<{ status: number }> };

function attacks(victim: Side): Attack[] {
  const v = ids[victim];
  const me = ids[other(victim)];
  const booking = { guestName: 'X', guestEmail: 'x@x.test', checkInDate: '2031-01-01', checkOutDate: '2031-01-03' };
  return [
    { name: 'edit another tenant\'s menu item', expectStatus: 404, run: () => call(menu.PATCH, 'PATCH', '/api/menu', { body: { menuItemId: v.item, name: 'hacked', price: 1 } }) },
    { name: 'move my menu item into another tenant\'s category', expectStatus: 404, run: () => call(menu.PATCH, 'PATCH', '/api/menu', { body: { menuItemId: me.item, categoryId: v.category } }) },
    { name: 'delete another tenant\'s menu item', expectStatus: 404, run: () => call(menu.DELETE, 'DELETE', `/api/menu?id=${v.item}`) },
    { name: 'create a menu item in another tenant\'s category', expectStatus: 404, run: () => call(menu.POST, 'POST', '/api/menu', { body: { name: 'n', price: 10, categoryId: v.category } }) },
    { name: 'delete another tenant\'s category', expectStatus: 404, run: () => call(categories.DELETE, 'DELETE', `/api/menu-categories?id=${v.category}`) },
    { name: 'change another tenant\'s room status', expectStatus: 404, run: () => call(rooms.PATCH, 'PATCH', '/api/rooms', { body: { roomId: v.room, status: 'maintenance' } }) },
    { name: 'delete another tenant\'s room', expectStatus: 404, run: () => call(rooms.DELETE, 'DELETE', `/api/rooms?id=${v.room}`) },
    { name: 'create a room using another tenant\'s room type', expectStatus: 404, run: () => call(rooms.POST, 'POST', '/api/rooms', { body: { roomNumber: '9', roomTypeId: v.roomType } }) },
    { name: 'point my room at another tenant\'s room type', expectStatus: 404, run: () => call(rooms.PATCH, 'PATCH', '/api/rooms', { body: { roomId: me.room, roomTypeId: v.roomType } }) },
    { name: 'edit another tenant\'s room type', expectStatus: 404, run: () => call(roomTypes.PUT, 'PUT', '/api/room-types', { body: { id: v.roomType, name: 'hacked' } }) },
    { name: 'delete another tenant\'s room type', expectStatus: 404, run: () => call(roomTypes.DELETE, 'DELETE', `/api/room-types?id=${v.roomType}`) },
    { name: 'place an order on another tenant\'s table', expectStatus: 404, run: () => call(orders.POST, 'POST', '/api/orders', { body: { tableId: v.table, items: [{ menuItemId: me.item, quantity: 1 }] } }) },
    { name: 'order another tenant\'s dish at my table', expectStatus: 400, run: () => call(orders.POST, 'POST', '/api/orders', { body: { tableId: me.table, items: [{ menuItemId: v.item, quantity: 1 }] } }) },
    { name: 'change another tenant\'s order status (PATCH /orders/[id])', expectStatus: 404, run: () => call(orderById.PATCH, 'PATCH', `/api/orders/${v.order}`, { params: { id: v.order }, body: { status: 'cancelled' } }) },
    { name: 'change another tenant\'s order status (PATCH /orders/[id]/status)', expectStatus: 404, run: () => call(orderStatus.PATCH, 'PATCH', `/api/orders/${v.order}/status`, { params: { id: v.order }, body: { status: 'ready' } }) },
    { name: 'settle another tenant\'s table', expectStatus: 404, run: () => call(settle.POST, 'POST', '/api/orders/settle-tab', { body: { tableId: v.table } }) },
    { name: 'book another tenant\'s room', expectStatus: 404, run: () => call(bookings.POST, 'POST', '/api/bookings', { body: { ...booking, roomId: v.room } }) },
    { name: 'cancel another tenant\'s booking', expectStatus: 404, run: () => call(bookingById.PATCH, 'PATCH', `/api/bookings/${v.booking}`, { params: { id: v.booking }, body: { action: 'cancel' } }) },
    { name: 'mark another tenant\'s bill paid', expectStatus: 404, run: () => call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId: v.bill, paymentMethod: 'cash' } }) },
    { name: 'raise a bill against another tenant\'s booking', expectStatus: 404, run: () => call(billing.POST, 'POST', '/api/billing', { body: { bookingId: v.booking, items: [{ amount: 1, quantity: 1 }] } }) },
    { name: 'read another tenant\'s kitchen display', expectStatus: 404, run: () => call(kds.GET, 'GET', `/api/kds/${v.outlet}`, { params: { outletId: v.outlet } }) },
    { name: 'listen to another tenant\'s live stream by outlet id', expectStatus: 403, run: () => call(sse.GET, 'GET', `/api/sse/kds/${v.outlet}`, { params: { outletId: v.outlet } }) },
    { name: 'listen to another tenant\'s live stream by tenant id', expectStatus: 403, run: () => call(sse.GET, 'GET', `/api/sse/kds/${v.tenant}`, { params: { outletId: v.tenant } }) },
    { name: 'remove another tenant\'s staff member', expectStatus: 404, run: () => call(staffById.DELETE, 'DELETE', `/api/staff/${v.staff}`, { params: { id: v.staff } }) },
  ];
}

describe.each([
  ['A', 'ownerB' as Persona], // victim A, attacker is B's owner
  ['B', 'ownerA' as Persona],
] as [Side, Persona][])('cross-tenant writes: victim is tenant %s', (victim, attacker) => {
  beforeEach(resetAndSeed);

  for (const attack of attacks(victim)) {
    it(`refuses to ${attack.name} and changes nothing`, async () => {
      loginAs(attacker);
      const before = await dump();
      const result = await attack.run();
      expect(result.status).toBe(attack.expectStatus);
      expect(await dump()).toBe(before);
    });
  }
});

describe('cross-tenant reads', () => {
  beforeEach(resetAndSeed);

  const lists: [string, (...a: any[]) => Promise<Response> | Response, string][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
    ['menu', menu.GET, '/api/menu'],
    ['menu categories', categories.GET, '/api/menu-categories'],
    ['rooms', rooms.GET, '/api/rooms'],
    ['room types', roomTypes.GET, '/api/room-types'],
    ['tables', tablesRoute.GET, '/api/tables'],
    ['orders', orders.GET, '/api/orders'],
    ['bookings', bookings.GET, '/api/bookings'],
    ['bills', billing.GET, '/api/billing'],
    ['staff', staffList.GET, '/api/staff'],
  ];

  for (const [victim, attacker] of [['B', 'ownerA'], ['A', 'ownerB']] as [Side, Persona][]) {
    for (const [name, handler, url] of lists) {
      it(`${attacker} never sees tenant ${victim}'s ${name}`, async () => {
        loginAs(attacker);
        const { status, json } = await call(handler, 'GET', url);
        expect(status).toBe(200);
        const body = JSON.stringify(json);
        for (const id of Object.values(ids[victim])) expect(body).not.toContain(id);
        expect(Array.isArray(json) ? json.length : 1).toBeGreaterThan(0); // the list is not trivially empty
      });
    }
  }
});

describe('malformed ids are not found, not server errors', () => {
  beforeEach(resetAndSeed);

  it.each([
    ['menu', () => call(menu.DELETE, 'DELETE', '/api/menu?id=not-a-uuid')],
    ['rooms', () => call(rooms.DELETE, 'DELETE', '/api/rooms?id=123')],
    ['booking', () => call(bookingById.PATCH, 'PATCH', '/api/bookings/abc', { params: { id: 'abc' }, body: { action: 'cancel' } })],
    ['order', () => call(orderStatus.PATCH, 'PATCH', '/api/orders/zzz/status', { params: { id: 'zzz' }, body: { status: 'ready' } })],
    ['kitchen display', () => call(kds.GET, 'GET', '/api/kds/nope', { params: { outletId: 'nope' } })],
  ])('%s returns 404', async (_name, run) => {
    loginAs('ownerA');
    expect((await run()).status).toBe(404);
  });
});
