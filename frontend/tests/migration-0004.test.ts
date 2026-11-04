import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { freshDb, MIGRATIONS } from './helpers/db';

/**
 * Migration 0004 runs on a database that already has payments in it (including old Stripe ones), so it is tested
 * the way a real database meets it: at 0003 with data, then 0004 on top.
 */
const sqlOf = (file: string) => fs.readFileSync(path.join(MIGRATIONS, file), 'utf-8').split('--> statement-breakpoint').join('\n');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = uuid(1), BILL = uuid(2), G = uuid(3);

async function databaseAt0003() {
  const f = freshDb();
  for (const file of ['0000_init.sql', '0001_orders_source.sql', '0002_booking_no_overlap.sql', '0003_hotel_bills_and_payment_details.sql']) await f.client.exec(sqlOf(file));
  await f.client.exec(`
    insert into tenants (id, name, slug, owner_email) values ('${T}', 'Tenant', 'tenant', 'o@t.test');
    insert into guests (id, tenant_id, email, name) values ('${G}', '${T}', 'g@t.test', 'Guest');
    insert into bills (id, tenant_id, guest_id, total_amount, paid_amount, status) values ('${BILL}', '${T}', '${G}', '1000.00', '500.00', 'partial');
    insert into payments (id, tenant_id, bill_id, amount, method, stripe_payment_intent_id) values ('${uuid(10)}', '${T}', '${BILL}', '200.00', 'stripe', 'pi_old');
    insert into payments (id, tenant_id, bill_id, amount, method) values ('${uuid(11)}', '${T}', '${BILL}', '300.00', 'cash');
  `);
  return f;
}
const insertPayment = (n: number, method: string, razorpayId: string | null) =>
  `insert into payments (id, tenant_id, bill_id, amount, method, razorpay_payment_id) values ('${uuid(n)}', '${T}', '${BILL}', '10.00', '${method}', ${razorpayId ? `'${razorpayId}'` : 'null'})`;

describe('migration 0004: payment settings and Razorpay', () => {
  it('keeps every existing payment (old Stripe ones included) and gives each property the default settings', async () => {
    const { client } = await databaseAt0003();
    await client.exec(sqlOf('0004_payment_settings_and_razorpay.sql'));

    const old = (await client.query(`select method, amount, stripe_payment_intent_id, razorpay_payment_id from payments order by method`)).rows;
    expect(old).toEqual([
      { method: 'cash', amount: '300.00', stripe_payment_intent_id: null, razorpay_payment_id: null },
      { method: 'stripe', amount: '200.00', stripe_payment_intent_id: 'pi_old', razorpay_payment_id: null },
    ]);
    expect((await client.query(`select payment_settings from tenants`)).rows).toEqual([{ payment_settings: {} }]);
  });

  it('accepts razorpay payments, still refuses unknown methods, and lets a Razorpay payment id back only one payment', async () => {
    const { client } = await databaseAt0003();
    await client.exec(sqlOf('0004_payment_settings_and_razorpay.sql'));

    await client.exec(insertPayment(20, 'razorpay', 'pay_abc'));
    await expect(client.exec(insertPayment(21, 'razorpay', 'pay_abc'))).rejects.toThrow(/payments_razorpay_payment_uq/);
    await expect(client.exec(insertPayment(22, 'bitcoin', null))).rejects.toThrow(/payments_method_check/);
    // Payments without a Razorpay id are unaffected by the unique rule.
    await client.exec(insertPayment(23, 'cash', null));
    await client.exec(insertPayment(24, 'cash', null));
  });

  it('a new tenant row gets the empty default without being told', async () => {
    const { client } = await databaseAt0003();
    await client.exec(sqlOf('0004_payment_settings_and_razorpay.sql'));
    await client.exec(`insert into tenants (id, name, slug, owner_email) values ('${uuid(5)}', 'New', 'new', 'n@t.test')`);
    expect((await client.query(`select payment_settings from tenants where id = '${uuid(5)}'`)).rows).toEqual([{ payment_settings: {} }]);
  });
});
