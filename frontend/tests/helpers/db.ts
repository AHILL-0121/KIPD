import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';

/**
 * A real Postgres (PGlite, in memory) built by running the REAL migration files in drizzle/.
 * So every test also proves that the migrations produce a schema the app code works with,
 * including constraints and indexes added after the baseline.
 */
export const MIGRATIONS = path.resolve(__dirname, '..', '..', 'drizzle');

const client = new PGlite({ extensions: { btree_gist } });
export const testDb = drizzle(client, { schema });

// The app uses the Neon HTTP driver, which has db.batch(). PGlite's driver does not, so provide
// the same contract: run the statements in order and return their results.
(testDb as unknown as { batch: unknown }).batch = async (queries: PromiseLike<unknown>[]) => {
  const results: unknown[] = [];
  for (const q of queries) results.push(await q);
  return results;
};

export const ready = migrate(testDb, { migrationsFolder: MIGRATIONS });

/** A second, empty database, for tests that need to control exactly which migrations are applied. */
export function freshDb() {
  const c = new PGlite({ extensions: { btree_gist } });
  return { client: c, db: drizzle(c, { schema }) };
}
