import { beforeEach, describe, expect, it } from 'vitest';
import * as menu from '@/app/api/public/menu/[slug]/route';
import * as publicOrders from '@/app/api/public/orders/route';
import * as publicOrder from '@/app/api/public/orders/[id]/route';
import * as hotel from '@/app/api/public/hotel/[slug]/route';
import * as publicBookings from '@/app/api/public/bookings/route';
import * as bookingById from '@/app/api/bookings/[id]/route';
import * as staffOrders from '@/app/api/orders/route';
import { registerClient, unregisterClient } from '@/lib/realtime';
import { resetRateLimits } from '@/lib/rate-limit';
import { todayInZone } from '@/lib/tz';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
/** The hotel's calendar date N days from today (the booking rules are relative to today). */
const D = (n: number) => new Date(Date.parse(`${todayInZone('Asia/Kolkata')}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(async () => { await resetAndSeed(); resetRateLimits(); });

/* ───────────────────────── the guest menu ───────────────────────── */

const getMenu = (slug: string, table?: string) =>
  call(menu.GET, 'GET', `/api/public/menu/${slug}${table ? `?table=${table}` : ''}`, { params: { slug } });

describe('public menu', () => {
  it('shows a restaurant\'s available dishes, with no internal ids', async () => {
    await q(`insert into menu_items (tenant_id, outlet_id, category_id, name, price, is_available) values ('${A.tenant}', '${A.outlet}', '${A.category}', 'Sold out dish', '50', false)`);
    const r = await getMenu('outlet-a', A.table);
    expect(r.status).toBe(200);
    expect(r.json.restaurant).toEqual({ name: 'Outlet A' });
    expect(r.json.table).toEqual({ number: 'T-A' });
    expect(r.json.categories).toHaveLength(1);
    expect(r.json.categories[0].items.map((i: { name: string }) => i.name)).toEqual(['Dish A']); // the switched-off dish is not shown
    expect(r.json.categories[0].items[0].price).toBe(100);

    const body = JSON.stringify(r.json);
    for (const secret of [A.tenant, A.outlet, A.property, B.item, B.category, 'Dish B']) expect(body).not.toContain(secret);
  });

  it('hides empty categories', async () => {
    await q(`insert into menu_categories (tenant_id, outlet_id, name) values ('${A.tenant}', '${A.outlet}', 'Nothing here')`);
    const r = await getMenu('outlet-a');
    expect(r.json.categories.map((c: { name: string }) => c.name)).toEqual(['Category A']);
  });

  it('works without a table, but refuses a table that is not this restaurant\'s', async () => {
    expect((await getMenu('outlet-a')).json.table).toBeNull();
    expect((await getMenu('outlet-a', B.table)).status).toBe(404);   // another tenant's table
    expect((await getMenu('outlet-a', 'nope')).status).toBe(404);    // not even an id
  });

  it('treats unknown, suspended, deleted and switched-off restaurants identically (one generic 404)', async () => {
    const unknown = await getMenu('no-such-place');
    await q(`update tenants set status = 'suspended' where id = '${A.tenant}'`);
    const suspended = await getMenu('outlet-a');
    await q(`update tenants set status = 'active', deleted_at = now() where id = '${A.tenant}'`);
    const deleted = await getMenu('outlet-a');
    await q(`update tenants set deleted_at = null where id = '${A.tenant}'`);
    await q(`update outlets set is_active = false where id = '${A.outlet}'`);
    const off = await getMenu('outlet-a');
    for (const r of [unknown, suspended, deleted, off]) {
      expect(r.status).toBe(404);
      expect(r.json).toEqual(unknown.json);
    }
    expect((await getMenu('BAD SLUG!!')).status).toBe(404);
  });

  it('is rate limited per caller', async () => {
    let last = 0;
    for (let i = 0; i < 91; i++) last = (await getMenu('outlet-a')).status;
    expect(last).toBe(429);
    const blocked = await getMenu('outlet-a');
    expect(blocked.res.headers.get('retry-after')).toMatch(/^\d+$/);
  });
});

/* ───────────────────────── guest ordering ───────────────────────── */

const order = (over: Record<string, unknown> = {}) => call(publicOrders.POST, 'POST', '/api/public/orders', {
  body: { slug: 'outlet-a', tableId: A.table, items: [{ menuItemId: A.item, quantity: 2 }], ...over },
});

describe('public ordering', () => {
  it('creates a guest order priced from the database, ignoring anything price-related in the request', async () => {
    const r = await order({ items: [{ menuItemId: A.item, quantity: 3, price: 1, totalAmount: 1 }], totalAmount: 1, price: 1, note: 'No onions' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ success: true, status: 'new', total: 300 });

    const [o] = await q<{ source: string; status: string; total_amount: string; special_instructions: string; tenant_id: string; table_id: string }>(
      `select source, status, total_amount, special_instructions, tenant_id, table_id from orders where id = '${r.json.orderId}'`);
    expect(o).toEqual({ source: 'guest', status: 'new', total_amount: '300.00', special_instructions: 'No onions', tenant_id: A.tenant, table_id: A.table });
    expect(await q(`select price, quantity from order_items where order_id = '${r.json.orderId}'`)).toEqual([{ price: '100.00', quantity: 3 }]);
  });

  it('appears on the staff Orders screen and is pushed to the kitchen display live', async () => {
    const pushed: string[] = [];
    const id = registerClient(A.outlet, { enqueue: (d: Uint8Array) => pushed.push(new TextDecoder().decode(d)) } as never);
    const r = await order();
    unregisterClient(id);
    expect(pushed.join('')).toContain('T-A');

    loginAs('waiterA');
    const list = await call(staffOrders.GET, 'GET', '/api/orders');
    expect(list.json.map((o: { id: string }) => o.id)).toContain(r.json.orderId);
  });

  it.each([
    ['a table at another restaurant', { tableId: B.table }, 404],
    ['a dish from another restaurant', { items: [{ menuItemId: B.item, quantity: 1 }] }, 400],
    ['zero quantity', { items: [{ menuItemId: A.item, quantity: 0 }] }, 400],
    ['too many of one dish', { items: [{ menuItemId: A.item, quantity: 21 }] }, 400],
    ['an empty order', { items: [] }, 400],
    ['more than 25 lines', { items: Array.from({ length: 26 }, () => ({ menuItemId: A.item, quantity: 1 })) }, 400],
    ['a hidden honeypot field filled in (a bot)', { website: 'http://spam.example' }, 400],
    ['a malformed table id', { tableId: 'abc' }, 400],
    ['a slug that is not the table\'s restaurant', { slug: 'outlet-b' }, 404],
  ])('rejects %s', async (_name, over, status) => {
    const before = await q(`select id from orders`);
    expect((await order(over as Record<string, unknown>)).status).toBe(status);
    expect(await q(`select id from orders`)).toHaveLength(before.length); // nothing was created
  });

  it('refuses a dish that has been switched off, and an absurdly large order', async () => {
    await q(`update menu_items set is_available = false where id = '${A.item}'`);
    const off = await order();
    expect(off.status).toBe(400);
    expect(off.json.error).toMatch(/not available/i);

    await q(`update menu_items set is_available = true, price = '30000' where id = '${A.item}'`);
    const big = await order({ items: [{ menuItemId: A.item, quantity: 2 }] });
    expect(big.status).toBe(400);
    expect(big.json.error).toMatch(/staff/i);
  });

  it('does not let one table pile up unacknowledged orders', async () => {
    for (let i = 0; i < 3; i++) expect((await order()).status).toBe(201);
    const fourth = await order();
    expect(fourth.status).toBe(429);
    expect(fourth.res.headers.get('retry-after')).toBe('60');

    // once the kitchen acknowledges them, the table can order again
    await q(`update orders set status = 'preparing' where source = 'guest'`);
    expect((await order()).status).toBe(201);
  });

  it('is rate limited per caller, and counts bad requests too', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await order({ items: [] })).status);
    expect(statuses).toEqual([400, 400, 400, 400, 400, 400, 429]);
  });

  it('is unavailable for a suspended restaurant', async () => {
    await q(`update tenants set status = 'suspended' where id = '${A.tenant}'`);
    expect((await order()).status).toBe(404);
  });
});

describe('tracking an order', () => {
  const track = (id: string, table: string) => call(publicOrder.GET, 'GET', `/api/public/orders/${id}?table=${table}`, { params: { id } });

  it('shows status and items to the guest who has the link and the table', async () => {
    const placed = await order();
    const r = await track(placed.json.orderId, A.table);
    expect(r.json).toMatchObject({ status: 'new', total: 200, items: [{ name: 'Dish A', quantity: 2 }] });

    await q(`update orders set status = 'ready' where id = '${placed.json.orderId}'`);
    expect((await track(placed.json.orderId, A.table)).json.status).toBe('ready');
  });

  it('needs the right table, and never exposes staff-entered orders or other tenants\' orders', async () => {
    const placed = await order();
    expect((await track(placed.json.orderId, B.table)).status).toBe(404);  // wrong table
    expect((await track(A.order, A.table)).status).toBe(404);              // seeded order was entered by staff
    expect((await track(B.order, B.table)).status).toBe(404);
    expect((await track('nope', A.table)).status).toBe(404);
  });
});

/* ───────────────────────── hotel booking ───────────────────────── */

const roomTypes = (slug: string, dates = '') => call(hotel.GET, 'GET', `/api/public/hotel/${slug}${dates}`, { params: { slug } });
const book = (over: Record<string, unknown> = {}) => call(publicBookings.POST, 'POST', '/api/public/bookings', {
  body: { slug: 'tenant-a', roomTypeId: A.roomType, checkIn: D(40), checkOut: D(42), guests: 2, name: 'Asha Rao', email: 'Asha@Example.test', phone: '+91 98765 43210', ...over },
});
const bookingRows = () => q<{ id: string; status: string; source: string; total_amount: string; check_in_date: Date; check_out_date: Date; room_id: string }>(
  `select * from bookings where tenant_id = '${A.tenant}' and id <> '${A.booking}' order by created_at`);

describe('public hotel page', () => {
  it('lists bookable room types without exposing rooms or internals', async () => {
    const r = await roomTypes('tenant-a');
    expect(r.status).toBe(200);
    expect(r.json.hotel.name).toBe('Property A');
    expect(r.json.roomTypes).toEqual([{ id: A.roomType, name: 'Type A', description: '', basePrice: 5000, maxOccupancy: 2, amenities: [], available: null }]);
    const body = JSON.stringify(r.json);
    for (const hidden of [A.tenant, A.property, A.room, '"101"', B.roomType, 'Type B']) expect(body).not.toContain(hidden);
  });

  it('hides room types that have no sellable room', async () => {
    await q(`update rooms set status = 'maintenance' where id = '${A.room}'`);
    expect((await roomTypes('tenant-a')).json.roomTypes).toEqual([]);
  });

  it('says whether a type is free for given dates (yes or no, never stock levels)', async () => {
    // tenant A's only room is booked 10 to 12 January 2030 (seed)
    expect((await roomTypes('tenant-a', '?checkIn=2030-01-11&checkOut=2030-01-13')).json.roomTypes[0].available).toBe(false);
    expect((await roomTypes('tenant-a', '?checkIn=2030-01-13&checkOut=2030-01-15')).json.roomTypes[0].available).toBe(true);
    await q(`update bookings set status = 'cancelled' where id = '${A.booking}'`);
    expect((await roomTypes('tenant-a', '?checkIn=2030-01-11&checkOut=2030-01-13')).json.roomTypes[0].available).toBe(true);
  });

  it('does not exist for restaurant-only or suspended businesses, or unknown slugs', async () => {
    const unknown = await roomTypes('nope');
    await q(`update tenants set type = 'restaurant' where id = '${A.tenant}'`);
    const restaurantOnly = await roomTypes('tenant-a');
    await q(`update tenants set type = 'hotel', status = 'suspended' where id = '${A.tenant}'`);
    const suspended = await roomTypes('tenant-a');
    for (const r of [unknown, restaurantOnly, suspended]) { expect(r.status).toBe(404); expect(r.json).toEqual(unknown.json); }
  });
});

describe('public booking requests', () => {
  it('stores a PENDING booking at hotel-local times, priced from the room type, without occupying the room', async () => {
    const r = await book();
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ success: true, status: 'pending', roomType: 'Type A', nights: 2, total: 10000, checkIn: D(40), checkOut: D(42) });
    expect(r.json.reference).toMatch(/^[0-9A-F]{8}$/);
    expect(JSON.stringify(r.json)).not.toContain('101'); // no room number

    const [b] = await bookingRows();
    expect(b).toMatchObject({ status: 'pending', source: 'online', total_amount: '10000.00', room_id: A.room });
    expect(new Date(b.check_in_date).toISOString()).toBe(`${D(40)}T08:30:00.000Z`);   // 14:00 in India
    expect(new Date(b.check_out_date).toISOString()).toBe(`${D(42)}T05:30:00.000Z`);  // 11:00 in India
    expect((await q<{ status: string }>(`select status from rooms where id = '${A.room}'`))[0].status).toBe('available'); // a future booking does not occupy the room today
  });

  it('creates the guest once, lower-cased, and does not overwrite an existing guest\'s details', async () => {
    await book();
    await book({ checkIn: D(60), checkOut: D(61), name: 'Someone Else Entirely' });
    const g = await q<{ email: string; name: string }>(`select email, name from guests where tenant_id = '${A.tenant}' and lower(email) = 'asha@example.test'`);
    expect(g).toEqual([{ email: 'asha@example.test', name: 'Asha Rao' }]);
  });

  it('refuses a second booking for the same room and dates, and a different type or room is unaffected', async () => {
    expect((await book()).status).toBe(201);
    const second = await book({ email: 'other@example.test' });
    expect(second.status).toBe(409);
    expect(second.json.error).toMatch(/no room/i);
    expect((await book({ checkIn: D(42), checkOut: D(43), email: 'turnover@example.test' })).status).toBe(201); // same-day turnover is fine
  });

  it('gives the next free room of that type to the next guest', async () => {
    await q(`insert into rooms (tenant_id, property_id, room_type_id, room_number) values ('${A.tenant}', '${A.property}', '${A.roomType}', '102')`);
    expect((await book()).status).toBe(201);
    expect((await book({ email: 'second@example.test' })).status).toBe(201);
    expect(new Set((await bookingRows()).map((b) => b.room_id)).size).toBe(2);
    expect((await book({ email: 'third@example.test' })).status).toBe(409);
  });

  it('never double-books the last room when two guests ask at the same moment (enforced by the database)', async () => {
    const results = await Promise.all([book({ email: 'one@example.test' }), book({ email: 'two@example.test' })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await bookingRows()).toHaveLength(1);
  });

  it('never books a room that is out of order, and a cancelled booking frees the room', async () => {
    await q(`update rooms set status = 'maintenance' where id = '${A.room}'`);
    expect((await book()).status).toBe(409);
    await q(`update rooms set status = 'available' where id = '${A.room}'`);
    const first = await book();
    expect(first.status).toBe(201);
    await q(`update bookings set status = 'cancelled' where id <> '${A.booking}' and tenant_id = '${A.tenant}'`);
    expect((await book({ email: 'again@example.test' })).status).toBe(201);
  });

  it('allows today, and applies the hotel\'s calendar, not the server\'s', async () => {
    const today = todayInZone('Asia/Kolkata');
    const next = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    expect((await book({ checkIn: today, checkOut: next })).status).toBe(201);
  });

  it.each([
    ['a date in the past', { checkIn: '2020-01-01', checkOut: '2020-01-03' }],
    ['check-out before check-in', { checkIn: D(42), checkOut: D(40) }],
    ['a zero-night stay', { checkIn: D(40), checkOut: D(40) }],
    ['more than 30 nights', { checkIn: D(40), checkOut: D(80) }],
    ['more than a year ahead', { checkIn: '2099-01-01', checkOut: '2099-01-02' }],
    ['more guests than the room sleeps', { guests: 5 }],
    ['an invalid email', { email: 'not-an-email' }],
    ['a garbage phone number', { phone: '<script>' }],
    ['a missing name', { name: '' }],
    ['a malformed date', { checkIn: '10/03/2031' }],
    ['a filled-in honeypot', { website: 'spam' }],
  ])('rejects %s with 400 and creates nothing', async (_name, over) => {
    expect((await book(over)).status).toBe(400);
    expect(await bookingRows()).toHaveLength(0);
  });

  it('cannot book another hotel\'s room type, or a hotel through the wrong slug', async () => {
    expect((await book({ roomTypeId: B.roomType })).status).toBe(404);
    expect((await book({ slug: 'tenant-b' })).status).toBe(404); // room type A at hotel B
    expect((await book({ slug: 'no-such-hotel' })).status).toBe(404);
  });

  it('is rate limited per caller', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await book({ guests: 99 })).status);
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });
});

describe('staff handling of an online booking request', () => {
  const confirm = (id: string) => call(bookingById.PATCH, 'PATCH', `/api/bookings/${id}`, { params: { id }, body: { action: 'confirm' } });

  it('the front desk can confirm it; the room is not marked occupied; it cannot be confirmed twice', async () => {
    await book();
    const [pending] = await bookingRows();

    loginAs('frontA');
    expect((await confirm(pending.id)).status).toBe(200);
    expect((await q<{ status: string }>(`select status from bookings where id = '${pending.id}'`))[0].status).toBe('confirmed');
    expect((await q<{ status: string }>(`select status from rooms where id = '${A.room}'`))[0].status).toBe('available');
    expect((await confirm(pending.id)).status).toBe(409);
  });

  it('only that hotel\'s staff, and only front-desk roles, can confirm', async () => {
    await book();
    const [pending] = await bookingRows();
    loginAs('ownerB');
    expect((await confirm(pending.id)).status).toBe(404);
    loginAs('waiterA');
    expect((await confirm(pending.id)).status).toBe(403);
  });
});
