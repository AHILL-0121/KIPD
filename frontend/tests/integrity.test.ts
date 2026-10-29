import { beforeEach, describe, expect, it } from 'vitest';
import * as tablesRoute from '@/app/api/tables/route';
import * as rooms from '@/app/api/rooms/route';
import * as bookings from '@/app/api/bookings/route';
import * as settle from '@/app/api/orders/settle-tab/route';
import * as orderStatus from '@/app/api/orders/[id]/status/route';
import * as notification from '@/app/api/payments/notification-match/route';
import fs from 'fs';
import path from 'path';
import { MIGRATIONS } from './helpers/db';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Run a statement that must be rejected by the database, and return the reason. */
async function rejected(statement: string): Promise<string> {
  try { await q(statement); } catch (e) {
    const parts: string[] = [];
    for (let x: any = e; x; x = x.cause) parts.push(String(x.message ?? x)); // eslint-disable-line @typescript-eslint/no-explicit-any
    return parts.join(' | ');
  }
  throw new Error(`the database accepted: ${statement}`);
}

beforeEach(resetAndSeed);

describe('the database refuses invalid values, whatever the code does', () => {
  const cases: [string, string, string][] = [
    ['an old order status', `update orders set status = 'delivered' where id = '${A.order}'`, 'orders_status_check'],
    ['a zero-quantity order line', `update order_items set quantity = 0`, 'order_items_quantity_check'],
    ['a negative price', `update menu_items set price = -1 where id = '${A.item}'`, 'menu_items_price_check'],
    ['a booking that ends before it starts', `update bookings set check_out_date = check_in_date where id = '${A.booking}'`, 'bookings_dates_check'],
    ['an unknown room status', `update rooms set status = 'haunted' where id = '${A.room}'`, 'rooms_status_check'],
    ['an unknown payment method', `insert into payments (tenant_id, bill_id, amount, method) values ('${A.tenant}', '${A.bill}', '5', 'bitcoin')`, 'payments_method_check'],
    ['an unknown staff role', `update staff set role = 'admin' where id = '${A.staff}'`, 'staff_role_check'],
    ['an unknown bill status', `update bills set status = 'refunded' where id = '${A.bill}'`, 'bills_status_check'],
    ['a negative bill total', `update bills set total_amount = -5 where id = '${A.bill}'`, 'bills_total_check'],
  ];
  it.each(cases)('rejects %s', async (_name, statement, constraint) => {
    expect(await rejected(statement)).toContain(constraint);
  });
});

describe('uniqueness', () => {
  it('one guest per email per tenant, ignoring capitals, but the same email is fine across tenants', async () => {
    expect(await rejected(`insert into guests (tenant_id, email, name) values ('${A.tenant}', 'GUEST@A.TEST', 'dup')`)).toContain('guests_tenant_email_uq');
    await q(`insert into guests (tenant_id, email, name) values ('${B.tenant}', 'guest@a.test', 'other tenant, same email')`); // allowed
  });

  it('table and room numbers are unique within an outlet / property, not across them', async () => {
    expect(await rejected(`insert into tables (tenant_id, outlet_id, table_number) values ('${A.tenant}', '${A.outlet}', 'T-A')`)).toContain('tables_outlet_number_uq');
    await q(`insert into tables (tenant_id, outlet_id, table_number) values ('${B.tenant}', '${B.outlet}', 'T-A')`); // different outlet: fine
    expect(await rejected(`insert into rooms (tenant_id, property_id, room_type_id, room_number) values ('${A.tenant}', '${A.property}', '${A.roomType}', '101')`)).toContain('rooms_property_number_uq');
  });

  it('outlet slugs are globally unique because the guest QR link uses only the slug', async () => {
    expect(await rejected(`insert into outlets (tenant_id, property_id, name, slug) values ('${B.tenant}', '${B.property}', 'Copy', 'outlet-a')`)).toContain('outlets_slug_uq');
  });

  it('the API reports duplicates as a clear 409, not a crash', async () => {
    loginAs('ownerA');
    expect((await call(tablesRoute.POST, 'POST', '/api/tables', { body: { tableNumber: 'T-A' } })).status).toBe(409);
    expect((await call(rooms.POST, 'POST', '/api/rooms', { body: { roomNumber: '101', roomTypeId: A.roomType } })).status).toBe(409);
  });
});

describe('what happens on delete', () => {
  it('deleting a table keeps its orders (the API unlinks them first)', async () => {
    loginAs('ownerA');
    expect((await call(tablesRoute.DELETE, 'DELETE', `/api/tables?id=${A.table}`)).status).toBe(200);
    expect(await q(`select table_id from orders where id = '${A.order}'`)).toEqual([{ table_id: null }]);
  });

  it('deleting an order removes its lines', async () => {
    await q(`delete from orders where id = '${A.order}'`);
    expect(await q(`select id from order_items where order_id = '${A.order}'`)).toHaveLength(0);
  });

  it('refuses to delete things that history still needs', async () => {
    expect(await rejected(`delete from menu_items where id = '${A.item}'`)).toMatch(/foreign key/i);   // ordered before
    expect(await rejected(`delete from rooms where id = '${A.room}'`)).toMatch(/foreign key/i);        // has a booking
    expect(await rejected(`delete from guests where id = '${A.guest}'`)).toMatch(/foreign key/i);       // has bookings and bills
    await q(`insert into payments (tenant_id, bill_id, amount, method) values ('${A.tenant}', '${A.bill}', '5', 'cash')`);
    expect(await rejected(`delete from bills where id = '${A.bill}'`)).toMatch(/foreign key/i);         // has a payment
  });

  it('an order cannot point at a bill that does not exist', async () => {
    expect(await rejected(`update orders set bill_id = '${uuid(999)}' where id = '${A.order}'`)).toMatch(/foreign key/i);
  });
});

describe('API behaviour with the new rules', () => {
  it('the old "delivered" status from a client is stored as "served"', async () => {
    loginAs('kitchenA');
    expect((await call(orderStatus.PATCH, 'PATCH', `/api/orders/${A.order}/status`, { params: { id: A.order }, body: { status: 'delivered' } })).status).toBe(200);
    expect(await q(`select status from orders where id = '${A.order}'`)).toEqual([{ status: 'served' }]);
  });
});

describe('simultaneous requests', () => {
  it('two bookings for the same brand-new guest at once create ONE guest and both succeed', async () => {
    loginAs('ownerA');
    const book = (email: string, from: string, to: string) => call(bookings.POST, 'POST', '/api/bookings', {
      body: { roomId: A.room, guestName: 'Race', guestEmail: email, checkInDate: from, checkOutDate: to },
    });
    const [one, two] = await Promise.all([
      book('Race@Example.test', '2032-01-01', '2032-01-03'),
      book('race@example.TEST', '2032-02-01', '2032-02-03'),
    ]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect(await q(`select id from guests where lower(email) = 'race@example.test'`)).toHaveLength(1);
  });

  it('two first-ever table settlements at once create ONE walk-in guest', async () => {
    // a second table with an open order, so two different tables can be settled together
    await q(`insert into tables (id, tenant_id, outlet_id, table_number) values ('${uuid(700)}', '${A.tenant}', '${A.outlet}', 'T-2')`);
    await q(`insert into orders (id, tenant_id, outlet_id, table_id, total_amount, status) values ('${uuid(701)}', '${A.tenant}', '${A.outlet}', '${uuid(700)}', '100.00', 'served')`);
    await q(`insert into order_items (tenant_id, order_id, menu_item_id, quantity, price) values ('${A.tenant}', '${uuid(701)}', '${A.item}', 1, '100.00')`);

    loginAs('ownerA');
    const [one, two] = await Promise.all([
      call(settle.POST, 'POST', '/api/orders/settle-tab', { body: { tableId: A.table } }),
      call(settle.POST, 'POST', '/api/orders/settle-tab', { body: { tableId: uuid(700) } }),
    ]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect(await q(`select id from guests where tenant_id = '${A.tenant}' and email = 'walkin@kipd.local'`)).toHaveLength(1);
    expect(await q(`select id from bills where guest_id in (select id from guests where email = 'walkin@kipd.local' and tenant_id = '${A.tenant}')`)).toHaveLength(2);
  });

  it('the same UPI payment reported twice at once is recorded once', async () => {
    loginAs('ownerA');
    const notify = () => call(notification.POST, 'POST', '/api/payments/notification-match', {
      body: { amount: 1180, reference: 'SAMEREF12345', packageName: 'com.phonepe.app' },
    });
    const results = await Promise.all([notify(), notify()]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.filter((r) => r.json.duplicate).length).toBe(1);
    expect(await q(`select id from payment_events where parsed_reference = 'SAMEREF12345'`)).toHaveLength(1);
  });
});

/**
 * The database itself refuses to mix tenants. Even if some future code forgot a tenant check, a row
 * cannot reference a parent that belongs to a different tenant (composite foreign keys on
 * (tenant_id, parent_id)). Each case below is a raw INSERT that the application would never send.
 */
describe('the database refuses cross-tenant references', () => {
  const x = uuid(800);
  const cases: [string, string][] = [
    ['an order in tenant A at tenant B\'s outlet', `insert into orders (id, tenant_id, outlet_id, total_amount) values ('${x}', '${A.tenant}', '${B.outlet}', '1')`],
    ['an order in tenant A at tenant B\'s table', `insert into orders (id, tenant_id, outlet_id, table_id, total_amount) values ('${x}', '${A.tenant}', '${A.outlet}', '${B.table}', '1')`],
    ['an order line pointing at tenant B\'s dish', `insert into order_items (tenant_id, order_id, menu_item_id, quantity, price) values ('${A.tenant}', '${A.order}', '${B.item}', 1, '1')`],
    ['a dish in tenant A\'s outlet using tenant B\'s category', `insert into menu_items (tenant_id, outlet_id, category_id, name, price) values ('${A.tenant}', '${A.outlet}', '${B.category}', 'x', '1')`],
    ['a room in tenant A using tenant B\'s room type', `insert into rooms (tenant_id, property_id, room_type_id, room_number) values ('${A.tenant}', '${A.property}', '${B.roomType}', '999')`],
    ['a booking for tenant B\'s guest', `insert into bookings (tenant_id, property_id, room_id, guest_id, check_in_date, check_out_date, total_amount) values ('${A.tenant}', '${A.property}', '${A.room}', '${B.guest}', '2040-01-01', '2040-01-02', '1')`],
    ['a bill for tenant B\'s guest', `insert into bills (tenant_id, guest_id, total_amount) values ('${A.tenant}', '${B.guest}', '1')`],
    ['a payment against tenant B\'s bill', `insert into payments (tenant_id, bill_id, amount, method) values ('${A.tenant}', '${B.bill}', '5', 'cash')`],
    ['a table in tenant A\'s name inside tenant B\'s outlet', `insert into tables (tenant_id, outlet_id, table_number) values ('${A.tenant}', '${B.outlet}', 'sneaky')`],
    ['moving an existing order to tenant B\'s bill', `update orders set bill_id = '${B.bill}' where id = '${A.order}'`],
    ['moving a booking to tenant B\'s room', `update bookings set room_id = '${B.room}', check_in_date = '2031-01-01', check_out_date = '2031-01-02' where id = '${A.booking}'`],
    ['re-parenting an existing outlet to tenant B\'s property', `update outlets set property_id = '${B.property}' where id = '${A.outlet}'`],
  ];
  it.each(cases)('rejects %s', async (_name, statement) => {
    expect(await rejected(statement)).toMatch(/foreign key/i);
  });

  it('accepts the same statements when everything belongs to one tenant (control)', async () => {
    await q(`insert into orders (id, tenant_id, outlet_id, table_id, total_amount) values ('${x}', '${A.tenant}', '${A.outlet}', '${A.table}', '1')`);
    await q(`insert into order_items (tenant_id, order_id, menu_item_id, quantity, price) values ('${A.tenant}', '${x}', '${A.item}', 1, '1')`);
    expect(await q(`select id from orders where id = '${x}'`)).toHaveLength(1);
  });

  it('every tenant-owned table has a NOT NULL tenant_id', async () => {
    const missing = await q<{ table_name: string }>(`
      select t.table_name from information_schema.tables t
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and t.table_name not in ('tenants', 'platform_audit_log')
        and not exists (select 1 from information_schema.columns c
                        where c.table_schema = 'public' and c.table_name = t.table_name
                          and c.column_name = 'tenant_id' and c.is_nullable = 'NO')`);
    expect(missing).toEqual([]);
  });

  it('every timestamp column is timestamptz (an exact instant)', async () => {
    const naive = await q<{ table_name: string; column_name: string }>(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and data_type = 'timestamp without time zone'`);
    expect(naive).toEqual([]);
  });
});

/**
 * The no-double-booking rule lives in the database (migration 0002), so it holds for every code path:
 * the staff screen, the public booking page, scripts, and anything written in future.
 */
describe('a room can never have two overlapping active bookings', () => {
  const room = A.room;
  const insert = (id: number, from: string, to: string, status = 'confirmed') =>
    `insert into bookings (id, tenant_id, property_id, room_id, guest_id, check_in_date, check_out_date, status, total_amount)
     values ('${uuid(id)}', '${A.tenant}', '${A.property}', '${room}', '${A.guest}', '${from}', '${to}', '${status}', '1')`;
  // the seed already has 10 Jan 2030 12:00 to 12 Jan 2030 10:00 for this room

  it('refuses an overlap, however it is attempted', async () => {
    expect(await rejected(insert(900, '2030-01-11T00:00:00Z', '2030-01-13T00:00:00Z'))).toMatch(/bookings_no_overlap|exclusion/i);
    expect(await rejected(insert(901, '2030-01-10T13:00:00Z', '2030-01-10T14:00:00Z'))).toMatch(/bookings_no_overlap|exclusion/i); // fully inside
    expect(await rejected(insert(902, '2030-01-01T00:00:00Z', '2030-01-20T00:00:00Z', 'pending'))).toMatch(/bookings_no_overlap|exclusion/i); // fully around, pending counts too
  });

  it('allows back-to-back stays, other rooms, and anything that is not active', async () => {
    await q(insert(903, '2030-01-12T10:00:00Z', '2030-01-13T10:00:00Z'));                // arrives the moment the previous guest leaves
    await q(insert(904, '2030-01-09T00:00:00Z', '2030-01-10T12:00:00Z'));                // leaves the moment the next guest arrives
    await q(insert(905, '2030-01-11T00:00:00Z', '2030-01-13T00:00:00Z', 'cancelled'));   // cancelled: no longer blocks
    await q(insert(906, '2030-01-11T00:00:00Z', '2030-01-13T00:00:00Z', 'checked_out')); // finished: no longer blocks
    await q(`insert into rooms (id, tenant_id, property_id, room_type_id, room_number) values ('${uuid(910)}', '${A.tenant}', '${A.property}', '${A.roomType}', '555')`);
    await q(`insert into bookings (tenant_id, property_id, room_id, guest_id, check_in_date, check_out_date, total_amount)
             values ('${A.tenant}', '${A.property}', '${uuid(910)}', '${A.guest}', '2030-01-10T12:00:00Z', '2030-01-12T10:00:00Z', '1')`); // same dates, different room
  });

  it('a cancelled booking cannot be brought back if the room has since been taken', async () => {
    await q(insert(907, '2030-01-11T00:00:00Z', '2030-01-13T00:00:00Z', 'cancelled'));
    expect(await rejected(`update bookings set status = 'confirmed' where id = '${uuid(907)}'`)).toMatch(/bookings_no_overlap|exclusion/i);
  });

  it('the staff screen also gets a clear 409, including when two staff book the last room at once', async () => {
    await q(`update bookings set status = 'cancelled' where id = '${A.booking}'`);
    loginAs('frontA');
    const attempt = (email: string) => call(bookings.POST, 'POST', '/api/bookings', {
      body: { roomId: A.room, guestName: 'Walk In', guestEmail: email, checkInDate: '2032-05-01', checkOutDate: '2032-05-03' },
    });
    const [one, two] = await Promise.all([attempt('one@x.test'), attempt('two@x.test')]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    expect(await q(`select id from bookings where room_id = '${A.room}' and check_in_date = '2032-05-01T00:00:00Z' or (room_id = '${A.room}' and check_in_date > '2032-01-01')`)).toHaveLength(1);
  });

  it('migration 0002 refuses to apply, with a clear message and no change, if overlaps already exist', async () => {
    const [, preflight, addConstraint] = fs.readFileSync(path.join(MIGRATIONS, '0002_booking_no_overlap.sql'), 'utf-8').split('--> statement-breakpoint').map((x) => x.trim());
    await q(`alter table bookings drop constraint bookings_no_overlap`);
    try {
      await q(insert(908, '2030-01-11T00:00:00Z', '2030-01-13T00:00:00Z')); // an overlap the old schema would have allowed
      const msg = await rejected(preflight);
      expect(msg).toMatch(/Migration 0002 stopped/);
      expect(msg).toMatch(/Nothing was changed/);
      expect((await q(`select 1 from pg_constraint where conname = 'bookings_no_overlap'`))).toHaveLength(0);

    } finally {
      await q(`delete from bookings where id = '${uuid(908)}'`);
      await q(preflight);          // ...and now the pre-flight passes
      await q(addConstraint);      // ...and the constraint goes on (also restores the schema for later tests)
    }
    expect(await q(`select 1 from pg_constraint where conname = 'bookings_no_overlap'`)).toHaveLength(1);
  });

  it('exists in the database (so the drift checker can verify it)', async () => {
    expect(await q(`select contype from pg_constraint where conname = 'bookings_no_overlap'`)).toEqual([{ contype: 'x' }]);
  });
});
