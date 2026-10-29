/**
 * Shared, database-agnostic helpers for the db:* scripts.
 * They take a `query` function, so the same code runs against Neon (scripts) and PGlite (tests).
 */
import fs from 'fs';
import path from 'path';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { is } from 'drizzle-orm';
import * as schema from '../src/db/schema';

export type Row = Record<string, unknown>;
/** Run ONE statement and return its rows. Parameters are positional ($1, $2...). */
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

export const MIGRATIONS_FOLDER = path.resolve(__dirname, '..', 'drizzle');

/* ───────────────────────── what we expect the database to look like ───────────────────────── */

export interface ExpectedTable {
  name: string;
  columns: { name: string; type: string; notNull: boolean }[];
  /** Index names that must exist. */
  indexes: string[];
  /** CHECK constraint names that must exist. */
  checks: string[];
  /** UNIQUE constraint names (the (tenant_id, id) targets that composite foreign keys point at). */
  uniques: string[];
  /** FOREIGN KEY names. Tenant isolation in the database depends on these. */
  foreignKeys: string[];
  /** EXCLUDE constraint names (hand-written SQL migrations; Drizzle does not model them). */
  exclusions: string[];
}

/** Constraints that exist only in custom SQL migrations. Keep in step with drizzle/*.sql. */
const MANUAL_EXCLUSIONS: Record<string, string[]> = { bookings: ['bookings_no_overlap'] };

/** The latest schema, straight from src/db/schema.ts. */
export function expectedFromSchema(): ExpectedTable[] {
  const tables = Object.values(schema).filter((t) => is(t, PgTable)) as PgTable[];
  return tables.map((table) => {
    const cfg = getTableConfig(table);
    return {
      name: cfg.name,
      columns: cfg.columns.map((c) => ({ name: c.name, type: c.getSQLType(), notNull: c.notNull })),
      indexes: cfg.indexes.map((i) => i.config.name).filter((n): n is string => !!n),
      checks: cfg.checks.map((c) => c.name),
      uniques: [
        ...cfg.uniqueConstraints.map((u) => u.name ?? u.getName()),
        ...cfg.columns.filter((c) => c.isUnique).map((c) => c.uniqueName), // column-level .unique()
      ].filter((n): n is string => !!n),
      foreignKeys: cfg.foreignKeys.map((f) => f.getName()),
      exclusions: MANUAL_EXCLUSIONS[cfg.name] ?? [],
    };
  });
}

/**
 * The schema as it was when a given migration was generated (drizzle/meta/NNNN_snapshot.json).
 * Useful to check a database that is known to be one migration behind.
 */
export function expectedFromSnapshot(index = 0): ExpectedTable[] {
  const file = path.join(MIGRATIONS_FOLDER, 'meta', `${String(index).padStart(4, '0')}_snapshot.json`);
  const snap = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
    tables: Record<string, {
      name: string;
      columns: Record<string, { name: string; type: string; notNull: boolean }>;
      indexes: Record<string, { name: string }>;
      uniqueConstraints: Record<string, { name: string }>;
      checkConstraints: Record<string, { name: string }>;
      foreignKeys: Record<string, { name: string }>;
    }>;
  };
  return Object.values(snap.tables).map((t) => ({
    name: t.name,
    columns: Object.values(t.columns).map((c) => ({ name: c.name, type: c.type, notNull: c.notNull })),
    indexes: Object.values(t.indexes).map((i) => i.name),
    checks: Object.values(t.checkConstraints ?? {}).map((c) => c.name),
    uniques: Object.values(t.uniqueConstraints ?? {}).map((u) => u.name),
    foreignKeys: Object.values(t.foreignKeys ?? {}).map((f) => f.name),
    exclusions: [], // snapshots do not record hand-written constraints
  }));
}

/* ───────────────────────── drift check (read-only) ───────────────────────── */

const norm = (t: string) =>
  t.toLowerCase().replace(/\s+/g, ' ')
    .replace('timestamp without time zone', 'timestamp')
    .replace('timestamp with time zone', 'timestamptz')
    .replace('character varying', 'varchar');

export interface DriftReport {
  /** Differences that make the code unsafe to run, or a migration unsafe to apply. */
  errors: string[];
  /** Things worth knowing that are not blocking (extra tables or columns the code does not use). */
  notes: string[];
}

/** Compare the live database with what we expect. Only ever runs SELECTs. */
export async function checkDrift(query: Query, expected: ExpectedTable[] = expectedFromSchema()): Promise<DriftReport> {
  const report: DriftReport = { errors: [], notes: [] };

  const liveCols = await query(
    `select table_name, column_name, data_type, is_nullable, numeric_precision, numeric_scale
       from information_schema.columns where table_schema = 'public'`,
  );
  const liveIdx = new Set((await query(`select indexname from pg_indexes where schemaname = 'public'`)).map((r) => String(r.indexname)));
  const constraints = await query(`select conname, contype from pg_constraint where connamespace = 'public'::regnamespace`);
  const named = (type: string) => new Set(constraints.filter((r) => r.contype === type).map((r) => String(r.conname)));
  const liveChecks = named('c');
  const liveUniques = named('u');
  const liveFks = named('f');
  const liveExclusions = named('x');
  const liveTables = new Set(liveCols.map((r) => String(r.table_name)));
  const expectedNames = new Set(expected.map((t) => t.name));

  for (const table of expected) {
    if (!liveTables.has(table.name)) {
      report.errors.push(`table "${table.name}" is missing from the database`);
      continue;
    }
    const cols = new Map(liveCols.filter((r) => r.table_name === table.name).map((r) => [String(r.column_name), r]));
    const expectedCols = new Set<string>();

    for (const col of table.columns) {
      expectedCols.add(col.name);
      const live = cols.get(col.name);
      if (!live) {
        report.errors.push(`column "${table.name}.${col.name}" is missing from the database`);
        continue;
      }
      // type
      const want = norm(col.type); // e.g. "numeric(10, 2)", "timestamp", "uuid"
      const base = want.replace(/\(.*\)/, '').trim();
      const have = norm(String(live.data_type));
      if (base === 'numeric') {
        const m = want.match(/\((\d+),\s*(\d+)\)/);
        if (have !== 'numeric') report.errors.push(`"${table.name}.${col.name}" should be ${want} but is ${have}`);
        else if (m && (Number(live.numeric_precision) !== Number(m[1]) || Number(live.numeric_scale) !== Number(m[2])))
          report.errors.push(`"${table.name}.${col.name}" should be ${want} but is numeric(${live.numeric_precision}, ${live.numeric_scale})`);
      } else if (base !== have && !(base === 'text' && have === 'character varying')) {
        report.errors.push(`"${table.name}.${col.name}" should be ${base} but is ${have}`);
      }
      // nullability
      const liveNotNull = live.is_nullable === 'NO';
      if (col.notNull !== liveNotNull) {
        report.errors.push(`"${table.name}.${col.name}" should be ${col.notNull ? 'NOT NULL' : 'nullable'} but is ${liveNotNull ? 'NOT NULL' : 'nullable'}`);
      }
    }
    for (const name of cols.keys()) {
      if (!expectedCols.has(name)) report.notes.push(`column "${table.name}.${name}" exists in the database but not in the expected schema (unused by the code)`);
    }
    for (const name of table.indexes) {
      if (!liveIdx.has(name)) report.errors.push(`index "${name}" is missing`);
    }
    for (const name of table.checks) {
      if (!liveChecks.has(name)) report.errors.push(`check constraint "${name}" is missing`);
    }
    for (const name of table.uniques) {
      if (!liveUniques.has(name)) report.errors.push(`unique constraint "${name}" is missing`);
    }
    for (const name of table.exclusions) {
      if (!liveExclusions.has(name)) report.errors.push(`exclusion constraint "${name}" is missing`);
    }
    for (const name of table.foreignKeys) {
      if (!liveFks.has(name)) report.errors.push(`foreign key "${name}" is missing`);
    }
  }
  for (const t of liveTables) {
    if (!expectedNames.has(t)) report.notes.push(`table "${t}" exists in the database but not in the expected schema`);
  }
  return report;
}

/* ───────────────────────── reset (destructive, guarded) ───────────────────────── */

export const hostOf = (url: string) => new URL(url).host;

/** The caller must retype the exact database host. Prevents resetting the wrong database by accident. */
export function assertConfirmed(url: string, confirm: string | undefined) {
  const host = hostOf(url);
  if (confirm !== host) {
    throw new Error(
      `Refusing to reset. To confirm you mean THIS database, re-run with:\n  --confirm=${host}\n` +
      (confirm ? `(you passed --confirm=${confirm}, which does not match)` : '(no --confirm was given)'),
    );
  }
}

/** Every table in the public schema with its row count: shown before anything is deleted. */
export async function describeData(query: Query): Promise<{ table: string; rows: number }[]> {
  const tables = await query(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
  const out: { table: string; rows: number }[] = [];
  for (const t of tables) {
    const name = String(t.table_name).replace(/"/g, '""');
    const [r] = await query(`select count(*)::int as n from "${name}"`);
    out.push({ table: String(t.table_name), rows: Number(r.n) });
  }
  return out;
}

/** Remove every table and the migration journal, leaving an empty database ready for `db:migrate`. */
export async function resetDatabase(exec: Query) {
  await exec(`drop schema if exists "drizzle" cascade`);
  await exec(`drop schema if exists "public" cascade`);
  await exec(`create schema "public"`);
}
