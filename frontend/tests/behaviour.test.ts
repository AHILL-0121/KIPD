import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as menu from '@/app/api/menu/route';
import * as categories from '@/app/api/menu-categories/route';
import * as rooms from '@/app/api/rooms/route';
import * as orders from '@/app/api/orders/route';
import * as settle from '@/app/api/orders/settle-tab/route';
import * as bookings from '@/app/api/bookings/route';
import * as bookingById from '@/app/api/bookings/[id]/route';
import * as billing from '@/app/api/billing/route';
import * as sse from '@/app/api/sse/kds/[outletId]/route';
import * as staffById from '@/app/api/staff/[id]/route';
import * as staffDirect from '@/app/api/staff/direct/route';
import * as notification from '@/app/api/payments/notification-match/route';
import * as adminTenants from '@/app/api/admin/tenants/route';
import { clerkClient } from '@clerk/nextjs';
import { emailTemplates } from '@/lib/email';
import { call, ids, loginAs, personas, q, resetAndSeed, staffIds } from './helpers/harness';
import { testDb } from './helpers/db';
import { bills, staff } from '@/db/schema';

const A = ids.A;
const g = globalThis as unknown as { __user?: string | null; __clerkCreateUser: ReturnType<typeof vi.fn> };

beforeEach(resetAndSeed);

describe('orders: the server decides the price', () => {
  it('computes the total from database prices and ignores prices sent by the client', async () => {
    loginAs('ownerA');
    const { status, json } = await call(orders.POST, 'POST', '/api/orders', {
      body: { tableId: A.table, items: [{ menuItemId: A.item, quantity: 3, price: 1, total: 1 }], totalAmount: 1 },
    });
    expect(status).toBe(200);
    const [order] = await q<{ total_amount: string }>(`select total_amount from orders where id = '${json.orderId}'`);
    const [line] = await q<{ price: string; quantity: number }>(`select price, quantity from order_items where order_id = '${json.orderId}'`);
    expect(order.total_amount).toBe('300.00');
    expect(line).toMatchObject({ price: '100.00', quantity: 3 });
  });

  it.each([[0], [-1], [1.5], [100], ['2']])('rejects quantity %s', async (quantity) => {
    loginAs('ownerA');
    const r = await call(orders.POST, 'POST', '/api/orders', { body: { tableId: A.table, items: [{ menuItemId: A.item, quantity }] } });
    expect(r.status).toBe(400);
  });

  it('rejects an empty order and an unavailable dish, and writes nothing', async () => {
    loginAs('ownerA');
    expect((await call(orders.POST, 'POST', '/api/orders', { body: { tableId: A.table, items: [] } })).status).toBe(400);

    await q(`update menu_items set is_available = false where id = '${A.item}'`);
    const r = await call(orders.POST, 'POST', '/api/orders', { body: { tableId: A.table, items: [{ menuItemId: A.item, quantity: 1 }] } });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/unavailable/i);
    expect((await q(`select id from orders`)).length).toBe(2); // only the two seeded orders
  });

  it('room service orders (no table) go to the tenant\'s own outlet', async () => {
    loginAs('ownerA');
    const r = await call(orders.POST, 'POST', '/api/orders', { body: { roomId: A.room, items: [{ menuItemId: A.item, quantity: 1 }] } });
    expect(r.status).toBe(200);
    const [o] = await q<{ outlet_id: string; type: string }>(`select outlet_id, type from orders where id = '${r.json.orderId}'`);
    expect(o).toMatchObject({ outlet_id: A.outlet, type: 'room_service' });
  });
});

describe('settling a table', () => {
  it('adds GST, creates one open bill, closes the tickets, and cannot be repeated', async () => {
    loginAs('ownerA');
    const first = await call(settle.POST, 'POST', '/api/orders/settle-tab', { body: { tableId: A.table } });
    expect(first.status).toBe(200);

    // seeded order = 2 x 100 = 200; 2.5% + 2.5% GST = 10; total 210
    const [bill] = await q<{ id: string; total_amount: string; status: string; guest_id: string }>(`select * from bills where id not in ('${A.bill}','${ids.B.bill}')`);
    expect(bill).toMatchObject({ total_amount: '210.00', status: 'open' });
    const [guest] = await q<{ tenant_id: string; email: string }>(`select tenant_id, email from guests where id = '${bill.guest_id}'`);
    expect(guest).toMatchObject({ tenant_id: A.tenant, email: 'walkin@kipd.local' });
    const [order] = await q<{ status: string; bill_id: string }>(`select status, bill_id from orders where id = '${A.order}'`);
    expect(order).toMatchObject({ status: 'closed', bill_id: bill.id });

    const again = await call(settle.POST, 'POST', '/api/orders/settle-tab', { body: { tableId: A.table } });
    expect(again.status).toBe(400);
  });
});

describe('bookings', () => {
  const body = (checkInDate: string, checkOutDate: string) => ({ roomId: A.room, guestName: 'New Guest', guestEmail: 'NEW@Guest.test', checkInDate, checkOutDate });

  it('creates a booking priced from the room type, with a normalised guest', async () => {
    loginAs('ownerA');
    const r = await call(bookings.POST, 'POST', '/api/bookings', { body: body('2031-02-01', '2031-02-03') });
    expect(r.status).toBe(200);
    expect(r.json.booking.totalAmount).toBe('10000.00'); // 2 nights x 5000
    const [guest] = await q<{ email: string; tenant_id: string }>(`select email, tenant_id from guests where name = 'New Guest'`);
    expect(guest).toMatchObject({ email: 'new@guest.test', tenant_id: A.tenant });
  });

  it('needs a guest name but not an email: each email-less booking gets its own hidden stand-in guest', async () => {
    loginAs('ownerA');
    const none = { roomId: A.room, checkInDate: '2031-03-01', checkOutDate: '2031-03-02' };
    expect((await call(bookings.POST, 'POST', '/api/bookings', { body: { ...none, guestName: '' } })).status).toBe(400);
    expect((await call(bookings.POST, 'POST', '/api/bookings', { body: { ...none, guestName: 'No Mail One', guestEmail: '' } })).status).toBe(200);
    expect((await call(bookings.POST, 'POST', '/api/bookings', { body: { ...none, guestName: 'No Mail Two', checkInDate: '2031-04-01', checkOutDate: '2031-04-02' } })).status).toBe(200);
    const rows = await q<{ name: string; email: string }>(`select name, email from guests where name like 'No Mail %' order by name`);
    expect(rows.map(r => r.name)).toEqual(['No Mail One', 'No Mail Two']);
    expect(rows.every(r => r.email.endsWith('@no-email.kipd.local'))).toBe(true);
    expect(new Set(rows.map(r => r.email)).size).toBe(2); // never merged into one guest
  });

  it('refuses to double-book overlapping dates', async () => {
    loginAs('ownerA');
    const r = await call(bookings.POST, 'POST', '/api/bookings', { body: body('2030-01-11', '2030-01-13') });
    expect(r.status).toBe(409);
  });

  it('allows a same-day turnover (new guest arrives as the old one leaves)', async () => {
    loginAs('ownerA');
    const r = await call(bookings.POST, 'POST', '/api/bookings', { body: body('2030-01-12T10:00:00Z', '2030-01-13T10:00:00Z') });
    expect(r.status).toBe(200);
  });

  it('does not let a cancelled booking block the room', async () => {
    loginAs('ownerA');
    await q(`update bookings set status = 'cancelled' where id = '${A.booking}'`);
    expect((await call(bookings.POST, 'POST', '/api/bookings', { body: body('2030-01-11', '2030-01-13') })).status).toBe(200);
  });

  it('rejects check-out on or before check-in', async () => {
    loginAs('ownerA');
    expect((await call(bookings.POST, 'POST', '/api/bookings', { body: body('2031-02-03', '2031-02-01') })).status).toBe(400);
    expect((await call(bookings.POST, 'POST', '/api/bookings', { body: body('2031-02-03', '2031-02-03') })).status).toBe(400);
  });

  it('moves booking and room status together on check-in, check-out and cancel', async () => {
    loginAs('ownerA');
    const state = async () => (await q<{ b: string; r: string }>(`select b.status as b, r.status as r from bookings b join rooms r on r.id = b.room_id where b.id = '${A.booking}'`))[0];
    const act = (action: string) => call(bookingById.PATCH, 'PATCH', `/api/bookings/${A.booking}`, { params: { id: A.booking }, body: { action } });

    await act('check-in');  expect(await state()).toEqual({ b: 'checked_in', r: 'occupied' });
    await act('check-out'); expect(await state()).toEqual({ b: 'checked_out', r: 'cleaning' });
    await act('cancel');    expect(await state()).toEqual({ b: 'cancelled', r: 'available' });
    expect((await act('explode')).status).toBe(400);
  });
});

describe('billing', () => {
  it('pays a bill once: records the payment and refuses a second payment', async () => {
    loginAs('ownerA');
    const pay = () => call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId: A.bill, paymentMethod: 'cash' } });
    expect((await pay()).status).toBe(200);
    const [b] = await q<{ status: string; paid_amount: string }>(`select status, paid_amount from bills where id = '${A.bill}'`);
    expect(b).toMatchObject({ status: 'paid', paid_amount: '1180.00' });
    expect(await q(`select amount, method from payments where bill_id = '${A.bill}'`)).toEqual([{ amount: '1180.00', method: 'cash' }]);

    expect((await pay()).status).toBe(409);
    expect((await q(`select id from payments where bill_id = '${A.bill}'`)).length).toBe(1); // no double payment row
  });

  it('totals a new bill in whole paise', async () => {
    loginAs('ownerA');
    const r = await call(billing.POST, 'POST', '/api/billing', { body: { bookingId: A.booking, items: [{ amount: 100, quantity: 2 }, { amount: 50.5, quantity: 1 }] } });
    expect(r.status).toBe(200);
    expect(r.json.bill.totalAmount).toBe('250.50');
  });
});

describe('menu editing', () => {
  it('only changes allowed fields (no mass assignment of outlet or id)', async () => {
    loginAs('ownerA');
    const r = await call(menu.PATCH, 'PATCH', '/api/menu', { body: { menuItemId: A.item, name: 'Renamed', outletId: ids.B.outlet, id: ids.B.item } });
    expect(r.status).toBe(200);
    const [item] = await q<{ id: string; name: string; outlet_id: string }>(`select id, name, outlet_id from menu_items where id = '${A.item}'`);
    expect(item).toEqual({ id: A.item, name: 'Renamed', outlet_id: A.outlet });
  });

  it.each([[{ name: '', price: 10 }], [{ name: 'x', price: -5 }], [{ name: 'x', price: 0 }], [{ name: 'x', price: 'free' }]])('rejects bad new item %j', async (bad) => {
    loginAs('ownerA');
    expect((await call(menu.POST, 'POST', '/api/menu', { body: { ...bad, categoryId: A.category } })).status).toBe(400);
  });

  it('puts a new item in its category\'s outlet and stores price as money', async () => {
    loginAs('ownerA');
    const r = await call(menu.POST, 'POST', '/api/menu', { body: { name: 'Chai', price: '12.5', categoryId: A.category } });
    expect(r.status).toBe(200);
    expect(r.json.menuItem).toMatchObject({ price: '12.50', outletId: A.outlet });
  });

  it('creates categories in the tenant\'s own outlet', async () => {
    loginAs('ownerA');
    const r = await call(categories.POST, 'POST', '/api/menu-categories', { body: { name: 'Desserts' } });
    expect(r.json.category.outletId).toBe(A.outlet);
  });

  it('rejects an invalid room status', async () => {
    loginAs('ownerA');
    expect((await call(rooms.PATCH, 'PATCH', '/api/rooms', { body: { roomId: A.room, status: 'bogus' } })).status).toBe(400);
  });
});

describe('UPI payment matching', () => {
  const notify = (over: object = {}) => call(notification.POST, 'POST', '/api/payments/notification-match', {
    body: { amount: 1180, reference: 'REF123456789', packageName: 'com.phonepe.app', ...over },
  });

  it('suggests the matching open bill without marking anything paid', async () => {
    loginAs('ownerA');
    const r = await notify();
    expect(r.json).toMatchObject({ success: true, status: 'pending_confirmation', matchedBillId: A.bill });
    expect((await q<{ status: string }>(`select status from bills where id = '${A.bill}'`))[0].status).toBe('open');
  });

  it('never matches another tenant\'s bill, even for the exact same amount', async () => {
    loginAs('ownerA');
    const r = await notify({ amount: 777, reference: 'REF000000001' }); // tenant B's bill total
    expect(r.json).toMatchObject({ status: 'unmatched', matchedBillId: null });
  });

  it('ignores a tenant id sent in the body and uses the session', async () => {
    loginAs('ownerA');
    await notify({ tenantId: ids.B.tenant, propertyId: ids.B.property });
    const [e] = await q<{ tenant_id: string; property_id: string | null }>(`select tenant_id, property_id from payment_events`);
    expect(e.tenant_id).toBe(A.tenant);
    expect(e.property_id).toBeNull(); // property from another tenant is dropped
  });

  it('treats a repeated reference as a duplicate', async () => {
    loginAs('ownerA');
    await notify();
    expect((await notify()).json).toMatchObject({ duplicate: true });
    expect((await q(`select id from payment_events`)).length).toBe(1);
  });

  it('reports ambiguity instead of guessing when two bills share an amount', async () => {
    loginAs('ownerA');
    await testDb.insert(bills).values({ tenantId: A.tenant, guestId: A.guest, totalAmount: '1180.00', status: 'open' });
    expect((await notify()).json).toMatchObject({ status: 'ambiguous', matchedBillId: null });
  });

  it('masks long numbers in stored text and rejects unknown apps', async () => {
    loginAs('ownerA');
    await notify({ rawText: 'Received Rs 1180 from 9876543210' });
    const [e] = await q<{ raw_payload: string }>(`select raw_payload from payment_events`);
    expect(e.raw_payload).not.toContain('9876543210');
    expect(e.raw_payload).toContain('******3210');
    expect((await notify({ packageName: 'com.evil.app', reference: 'REF999999999' })).status).toBe(400);
  });
});

describe('removing staff', () => {
  it('never removes the owner or yourself', async () => {
    await testDb.insert(staff).values({ id: '00000000-0000-4000-8000-000000000999', tenantId: A.tenant, clerkId: 'user_owner_row', email: 'o@a.test', name: 'Owner Row', role: 'owner', isActive: true });
    loginAs('managerA');
    expect((await call(staffById.DELETE, 'DELETE', '/api/staff/x', { params: { id: '00000000-0000-4000-8000-000000000999' } })).status).toBe(403);
    expect((await call(staffById.DELETE, 'DELETE', '/api/staff/x', { params: { id: staffIds.managerA } })).status).toBe(403);
    expect((await call(staffById.DELETE, 'DELETE', '/api/staff/x', { params: { id: staffIds.waiterA } })).status).toBe(200);
  });

  it('refuses to create a login for an email that already has one, and points to "Send invite"', async () => {
    (globalThis as unknown as { __existingEmails: Set<string> }).__existingEmails.add('kitchen+old@a.test');
    g.__clerkCreateUser.mockClear();
    loginAs('managerA');
    const r = await call(staffDirect.POST, 'POST', '/api/staff/direct', { body: { name: 'Old Login', email: 'Kitchen+Old@A.test', role: 'kitchen', password: 'a-long-password-1' } });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/already has a login/i);
    expect(r.json.error).toMatch(/Send invite/);
    expect(g.__clerkCreateUser).not.toHaveBeenCalled(); // nothing was created or changed in Clerk
    expect(await q(`select id from staff where email = 'kitchen+old@a.test'`)).toHaveLength(0);
  });

  it('gives the same answer if Clerk itself reports the email as taken (a race)', async () => {
    g.__clerkCreateUser.mockRejectedValueOnce({ errors: [{ code: 'form_identifier_exists', message: 'That email address is taken.' }] });
    loginAs('managerA');
    const r = await call(staffDirect.POST, 'POST', '/api/staff/direct', { body: { name: 'Raced', email: 'raced@a.test', role: 'waiter', password: 'a-long-password-1' } });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/Send invite/);
  });

  it('passes the reason Clerk gives through for other failures (for example a leaked password)', async () => {
    g.__clerkCreateUser.mockRejectedValueOnce({ errors: [{ code: 'form_password_pwned', longMessage: 'Password has been found in an online data breach.' }] });
    loginAs('managerA');
    const r = await call(staffDirect.POST, 'POST', '/api/staff/direct', { body: { name: 'Weak', email: 'weak@a.test', role: 'waiter', password: 'password1234' } });
    expect(r.status).toBe(422);
    expect(r.json.error).toMatch(/data breach/);
  });

  it('does not leave an orphan login when saving the staff record fails', async () => {
    loginAs('managerA');
    g.__clerkCreateUser.mockResolvedValueOnce({ id: personas.waiterA }); // clerk_id is unique, so the insert will fail
    const r = await call(staffDirect.POST, 'POST', '/api/staff/direct', { body: { name: 'Dup', email: 'dup@a.test', role: 'waiter', password: 'a-long-password-1' } });
    expect(r.status).toBe(409);
    expect(clerkClient.users.deleteUser).toHaveBeenCalledWith(personas.waiterA);
  });
});

describe('platform admin: creating a tenant', () => {
  const create = (over: object = {}) => call(adminTenants.POST, 'POST', '/api/admin/tenants', { body: { name: 'Sea View', slug: 'sea-view', ownerEmail: 'Owner@SeaView.test', type: 'both', ...over } });
  let spies: ReturnType<typeof vi.spyOn>[] = [];
  afterEach(() => { spies.forEach((s) => s.mockRestore()); spies = []; });

  it('is refused to ordinary tenant owners', async () => {
    loginAs('ownerA');
    expect((await create()).status).toBe(403);
  });

  it('validates the slug and refuses duplicates', async () => {
    loginAs('platformAdmin');
    expect((await create({ slug: 'Bad Slug!' })).status).toBe(400);
    expect((await create({ slug: 'tenant-a' })).status).toBe(409);
  });

  it('creates the tenant, a property, an outlet and an audit record', async () => {
    loginAs('platformAdmin');
    const r = await create();
    expect(r.status).toBe(200);
    const t = (await q<{ id: string }>(`select id from tenants where slug = 'sea-view'`))[0];
    expect((await q(`select id from properties where tenant_id = '${t.id}'`)).length).toBe(1);
    expect((await q(`select slug from outlets where slug = 'sea-view-restaurant'`)).length).toBe(1);
    expect((await q(`select action from platform_audit_log where target_id = '${t.id}'`))[0]).toEqual({ action: 'tenant.create' });
  });

  it('generates a strong random password and never writes it to any log', async () => {
    spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    loginAs('platformAdmin');
    const r = await create();
    const password: string = r.json.credentials.password;
    expect(password.length).toBeGreaterThanOrEqual(16);
    const second = await create({ slug: 'sea-view-2' });
    expect(second.json.credentials.password).not.toBe(password);

    const everything = spies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join('\n');
    expect(everything).not.toContain(password);
    expect(everything).not.toContain(second.json.credentials.password);
  });
});

describe('live stream', () => {
  it('opens for the tenant\'s own channel and sends a first message', async () => {
    loginAs('ownerA');
    const res: Response = await sse.GET(new NextRequest(`http://localhost/api/sse/kds/${A.tenant}`), { params: { outletId: A.tenant } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"connected"');
    await reader.cancel(); // stops the heartbeat timer
  });
});

describe('email templates', () => {
  it('escape user-supplied values', () => {
    const html = emailTemplates.staffInvite({ name: '<img src=x onerror=alert(1)>', hotelName: 'A&B "Hotel"', role: 'waiter', inviteUrl: 'https://kipd.test/i?a=1&b=2' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('A&amp;B &quot;Hotel&quot;');
    expect(html).toContain('href="https://kipd.test/i?a=1&amp;b=2"');
  });
});
