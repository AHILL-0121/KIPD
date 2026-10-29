import { describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { assertConfirmed, checkDrift, describeData, expectedFromSchema, expectedFromSnapshot, hostOf, resetDatabase, type Query, type Row } from '../scripts/db-lib';
import { freshDb, MIGRATIONS } from './helpers/db';

/**
 * The migration files are what a real database goes through, so they are tested directly:
 * building a database from nothing, noticing when a database has drifted, and the reset path.
 */
const asQuery = (client: PGlite): Query => async (text, params) => (await client.query(text, params as unknown[])).rows as Row[];

async function migratedFresh() {
  const f = freshDb();
  await migrate(f.db, { migrationsFolder: MIGRATIONS });
  return f;
}

describe('building a database from the migrations', () => {
  it('produces exactly what schema.ts declares: columns, types, indexes, checks, uniques and foreign keys', async () => {
    const { client } = await migratedFresh();
    const report = await checkDrift(asQuery(client));
    expect(report.errors).toEqual([]);
    expect(report.notes).toEqual([]);
  });

  it('the stored snapshot of the latest migration agrees with schema.ts', async () => {
    const { client } = await migratedFresh();
    expect((await checkDrift(asQuery(client), expectedFromSnapshot(0))).errors).toEqual([]);
  });

  it('is safe to run twice', async () => {
    const f = await migratedFresh();
    await expect(migrate(f.db, { migrationsFolder: MIGRATIONS })).resolves.toBeUndefined();
  });

  it('checks a meaningful number of things (guards against the checker silently checking nothing)', () => {
    const expected = expectedFromSchema();
    expect(expected.length).toBeGreaterThanOrEqual(20);
    expect(expected.flatMap((t) => t.foreignKeys).length).toBeGreaterThanOrEqual(40);
    expect(expected.flatMap((t) => t.uniques).length).toBeGreaterThanOrEqual(17);
    expect(expected.flatMap((t) => t.checks).length).toBeGreaterThanOrEqual(25);
  });
});

describe('the drift checker catches what it should', () => {
  const cases: [string, string, RegExp][] = [
    ['a missing column', `alter table orders drop column special_instructions`, /orders\.special_instructions" is missing/],
    ['a column that lost NOT NULL', `alter table orders alter column total_amount drop not null`, /orders\.total_amount" should be NOT NULL but is nullable/],
    ['a column with the wrong type', `alter table rooms alter column floor type text`, /rooms\.floor" should be integer but is text/],
    ['a timestamp that lost its time zone', `alter table orders alter column created_at type timestamp`, /orders\.created_at" should be timestamptz but is timestamp/],
    ['wrong money precision', `alter table menu_items alter column price type numeric(12,4)`, /menu_items\.price" should be numeric\(10, 2\) but is numeric\(12, 4\)/],
    ['a dropped index', `drop index idx_orders_table`, /index "idx_orders_table" is missing/],
    ['a dropped check constraint', `alter table orders drop constraint orders_status_check`, /check constraint "orders_status_check" is missing/],
    ['a dropped tenant foreign key (isolation would be unenforced)', `alter table orders drop constraint fk_orders_outlet`, /foreign key "fk_orders_outlet" is missing/],
    ['a dropped (tenant_id, id) unique constraint', `alter table order_items drop constraint fk_order_items_order; alter table orders drop constraint fk_orders_outlet; alter table orders drop constraint orders_tenant_id_uq`, /unique constraint "orders_tenant_id_uq" is missing/],
    ['a missing table', `drop table webhook_logs`, /table "webhook_logs" is missing/],
  ];
  it.each(cases)('%s', async (_name, sqlText, expected) => {
    const { client } = await migratedFresh();
    await client.exec(sqlText);
    const report = await checkDrift(asQuery(client));
    expect(report.errors.join('\n')).toMatch(expected);
  });

  it('treats extra columns and tables as notes, not errors', async () => {
    const { client } = await migratedFresh();
    await client.exec(`alter table bills add column payment_status text; create table scratch (id int)`);
    const report = await checkDrift(asQuery(client));
    expect(report.errors).toEqual([]);
    expect(report.notes.join('\n')).toMatch(/bills\.payment_status/);
    expect(report.notes.join('\n')).toMatch(/table "scratch"/);
  });
});

describe('the reset safety guard', () => {
  const url = 'postgresql://user:secret@ep-cool-name-123.eu-central-1.aws.neon.tech/neondb?sslmode=require';

  it('refuses without --confirm, and with the wrong host, and shows what to type', () => {
    expect(() => assertConfirmed(url, undefined)).toThrow(/--confirm=ep-cool-name-123\.eu-central-1\.aws\.neon\.tech/);
    expect(() => assertConfirmed(url, 'ep-other-host.neon.tech')).toThrow(/does not match/);
    expect(() => assertConfirmed(url, 'neondb')).toThrow();
  });

  it('accepts only the exact host', () => {
    expect(hostOf(url)).toBe('ep-cool-name-123.eu-central-1.aws.neon.tech');
    expect(() => assertConfirmed(url, hostOf(url))).not.toThrow();
  });

  it('never prints the password', () => {
    try { assertConfirmed(url, 'wrong'); } catch (e) { expect(String(e)).not.toContain('secret'); }
  });
});

describe('resetting and rebuilding', () => {
  it('lists what would be deleted, with row counts', async () => {
    const { client } = await migratedFresh();
    await client.exec(`insert into tenants (name, slug, owner_email) values ('T', 't', 'o@t.test')`);
    const data = await describeData(asQuery(client));
    expect(data.find((d) => d.table === 'tenants')).toEqual({ table: 'tenants', rows: 1 });
    expect(data.length).toBeGreaterThanOrEqual(20);
  });

  it('wipes every table and the migration journal, then migrations rebuild an identical database', async () => {
    const f = await migratedFresh();
    await f.client.exec(`insert into tenants (name, slug, owner_email) values ('T', 't', 'o@t.test')`);

    await resetDatabase(asQuery(f.client));
    expect(await describeData(asQuery(f.client))).toEqual([]);
    expect((await f.client.query(`select 1 from information_schema.schemata where schema_name = 'drizzle'`)).rows).toHaveLength(0);

    await migrate(f.db, { migrationsFolder: MIGRATIONS });
    expect((await checkDrift(asQuery(f.client))).errors).toEqual([]);
    expect((await f.client.query(`select count(*)::int as n from tenants`)).rows[0]).toEqual({ n: 0 });
  });
});

describe('lazy database connection', () => {
  it('importing the real db module does not need DATABASE_URL; the first query reports it clearly', async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const real = await vi.importActual<typeof import('@/db')>('@/db'); // does not throw at import
      expect(() => real.db.select).toThrow(/DATABASE_URL is not set/);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
