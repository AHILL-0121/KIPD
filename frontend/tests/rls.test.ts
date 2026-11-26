import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb, MIGRATIONS } from './helpers/db';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { ids } from './helpers/harness';

const TENANT_TABLES = [
  'properties',
  'room_types',
  'rooms',
  'guests',
  'bookings',
  'outlets',
  'menu_categories',
  'menu_items',
  'tables',
  'orders',
  'order_items',
  'bills',
  'payments',
  'refunds',
  'credit_notes',
  'invoice_counters',
  'tenant_audit_logs',
  'staff',
  'staff_invites',
  'razorpay_accounts',
  'payment_events',
  'ingredients',
  'recipe_items',
  'upi_payment_intents',
];

describe('Postgres Row-Level Security (migration 0014)', () => {
  let client: ReturnType<typeof freshDb>['client'];

  beforeEach(async () => {
    const f = freshDb();
    client = f.client;
    await migrate(f.db, { migrationsFolder: MIGRATIONS });
  });

  it('enables RLS on every tenant-owned table', async () => {
    const rows = (
      await client.query<{ relname: string; relrowsecurity: boolean }>(
        `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
      )
    ).rows;
    const byName = new Map(rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const table of TENANT_TABLES) {
      expect(byName.get(table), table).toBe(true);
    }
  });

  it('blocks cross-tenant reads and writes for non-owner database roles', async () => {
    const A = ids.A.tenant;
    const B = ids.B.tenant;
    await client.exec(`
      insert into tenants (id, name, slug, owner_email) values
        ('${A}', 'Tenant A', 'rls-a', 'a@rls.test'),
        ('${B}', 'Tenant B', 'rls-b', 'b@rls.test');
      insert into properties (id, tenant_id, name) values
        ('00000000-0000-4000-8000-00000000aa01', '${A}', 'Prop A'),
        ('00000000-0000-4000-8000-00000000bb01', '${B}', 'Prop B');
      do $$ begin create role kipd_rls_test; exception when duplicate_object then null; end $$;
      grant select, insert, update, delete on properties to kipd_rls_test;
    `);

    await client.exec(`begin; set local role kipd_rls_test; set local app.current_tenant_id = '${A}';`);
    const visible = (await client.query<{ name: string }>(`select name from properties`)).rows;
    expect(visible.map((r) => r.name)).toEqual(['Prop A']);

    await expect(
      client.exec(
        `insert into properties (id, tenant_id, name) values ('00000000-0000-4000-8000-00000000bb99', '${B}', 'Intruder')`,
      ),
    ).rejects.toThrow(/row-level security/i);
    await client.exec(`rollback;`);
  });
});
