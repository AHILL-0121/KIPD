import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { freshDb, MIGRATIONS } from './helpers/db';

/**
 * Migration 0003 changes bills that already exist, so it is run here the way a real database meets it:
 * a database at 0002 with data in it, then 0003 on top.
 */
const sqlOf = (file: string) => fs.readFileSync(path.join(MIGRATIONS, file), 'utf-8').split('--> statement-breakpoint').join('\n');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = uuid(1), P = uuid(2), RT = uuid(3), R = uuid(4), G = uuid(5), RT2 = uuid(6);
const booking = (n: number, status: string, from: string, to: string, total = '9000.00') =>
  `insert into bookings (id, tenant_id, property_id, room_id, guest_id, status, check_in_date, check_out_date, total_amount) values ('${uuid(100 + n)}', '${T}', '${P}', '${R}', '${G}', '${status}', '${from}', '${to}', '${total}');`;

async function databaseAt0002(extra = '') {
  const f = freshDb();
  for (const file of ['0000_init.sql', '0001_orders_source.sql', '0002_booking_no_overlap.sql']) await f.client.exec(sqlOf(file));
  await f.client.exec(`
    insert into tenants (id, name, slug, owner_email) values ('${T}', 'Tenant', 'tenant', 'o@t.test');
    insert into properties (id, tenant_id, name) values ('${P}', '${T}', 'Property');
    insert into room_types (id, tenant_id, property_id, name, base_price) values ('${RT}', '${T}', '${P}', 'Deluxe', '3000.00');
    insert into rooms (id, tenant_id, property_id, room_type_id, room_number) values ('${R}', '${T}', '${P}', '${RT}', '204');
    insert into guests (id, tenant_id, email, name) values ('${G}', '${T}', 'g@t.test', 'Guest');
    ${booking(1, 'confirmed', '2032-01-01T14:00:00Z', '2032-01-04T11:00:00Z', '9000.00')}
    ${booking(2, 'checked_in', '2032-02-01T14:00:00Z', '2032-02-02T11:00:00Z', '3000.00')}
    ${booking(3, 'checked_out', '2031-01-01T14:00:00Z', '2031-01-03T11:00:00Z', '6000.00')}
    ${booking(4, 'cancelled', '2032-03-01T14:00:00Z', '2032-03-02T11:00:00Z', '3000.00')}
    ${booking(5, 'pending', '2032-04-01T14:00:00Z', '2032-04-02T11:00:00Z', '3000.00')}
    ${extra}
  `);
  return f;
}

describe('migration 0003: hotel bills and payment details', () => {
  it('bills confirmed and checked-in bookings, and leaves finished, cancelled and pending ones alone', async () => {
    const { client } = await databaseAt0002();
    await client.exec(sqlOf('0003_hotel_bills_and_payment_details.sql'));
    const rows = (await client.query(`select b.id as booking_id, x.kind, x.status, x.total_amount, x.paid_amount, x.items_breakdown from bills x join bookings b on b.id = x.booking_id order by b.id`)).rows as {
      booking_id: string; kind: string; status: string; total_amount: string; paid_amount: string; items_breakdown: { items: { name: string; qty: number; rate: number; amt: number }[]; total: number };
    }[];
    expect(rows.map((r) => r.booking_id)).toEqual([uuid(101), uuid(102)]); // confirmed and checked in only
    expect(rows[0]).toMatchObject({ kind: 'stay', status: 'open', total_amount: '9000.00', paid_amount: '0.00' });
    expect(rows[0].items_breakdown.items).toEqual([{ name: 'Room 204 (Deluxe), 3 nights', qty: 3, rate: 3000, amt: 9000 }]);
    expect(rows[1].items_breakdown.items[0].name).toBe('Room 204 (Deluxe), 1 night');
  });

  it('marks existing bills that point at a booking as stays, and keeps the rest as restaurant bills', async () => {
    const { client } = await databaseAt0002(`
      insert into bills (id, tenant_id, booking_id, guest_id, total_amount, status, paid_amount) values ('${uuid(201)}', '${T}', '${uuid(103)}', '${G}', '6000.00', 'paid', '6000.00');
      insert into bills (id, tenant_id, guest_id, total_amount) values ('${uuid(202)}', '${T}', '${G}', '210.00');
    `);
    await client.exec(sqlOf('0003_hotel_bills_and_payment_details.sql'));
    const kinds = (await client.query(`select id, kind from bills where id in ('${uuid(201)}', '${uuid(202)}') order by id`)).rows;
    expect(kinds).toEqual([{ id: uuid(201), kind: 'stay' }, { id: uuid(202), kind: 'restaurant' }]);
    // the checked-out booking already had a bill, so it is not billed again
    expect((await client.query(`select 1 from bills where booking_id = '${uuid(103)}'`)).rows).toHaveLength(1);
  });

  it('does not bill a booking twice when it already has a bill', async () => {
    const { client } = await databaseAt0002(`insert into bills (id, tenant_id, booking_id, guest_id, total_amount, status) values ('${uuid(203)}', '${T}', '${uuid(101)}', '${G}', '9000.00', 'open');`);
    await client.exec(sqlOf('0003_hotel_bills_and_payment_details.sql'));
    expect((await client.query(`select id from bills where booking_id = '${uuid(101)}'`)).rows).toEqual([{ id: uuid(203) }]);
  });

  it('refuses, with a clear message and no change, if a bill is paid more than its total', async () => {
    const { client } = await databaseAt0002(`insert into bills (id, tenant_id, guest_id, total_amount, paid_amount) values ('${uuid(204)}', '${T}', '${G}', '100.00', '250.00');`);
    await expect(client.exec(sqlOf('0003_hotel_bills_and_payment_details.sql'))).rejects.toThrow(/Migration 0003 stopped: 1 bill\(s\) have a paid amount/);
    expect((await client.query(`select 1 from information_schema.columns where table_name = 'bills' and column_name = 'kind'`)).rows).toHaveLength(0);
  });

  it('refuses, with a clear message, if a booking already has two bills', async () => {
    const { client } = await databaseAt0002(`
      insert into bills (id, tenant_id, booking_id, guest_id, total_amount) values ('${uuid(205)}', '${T}', '${uuid(101)}', '${G}', '9000.00');
      insert into bills (id, tenant_id, booking_id, guest_id, total_amount) values ('${uuid(206)}', '${T}', '${uuid(101)}', '${G}', '9000.00');
    `);
    await expect(client.exec(sqlOf('0003_hotel_bills_and_payment_details.sql'))).rejects.toThrow(/more than one bill/);
  });
});
