/**
 * READ-ONLY. Compares the live database with what the code expects, and prints the differences.
 *
 *   npm run db:drift                    # expect the latest src/db/schema.ts
 *   npm run db:drift -- --migration=0   # expect the schema as of migration 0000 (a database one step behind)
 *
 * It only issues SELECT statements. Exit code 1 means there is drift that needs a human decision.
 */
import * as dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { checkDrift, expectedFromSchema, expectedFromSnapshot, type Query } from './db-lib';

dotenv.config({ path: '.env.local' });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (.env.local)');
  const arg = process.argv.find((a) => a.startsWith('--migration='));
  const migration = arg ? Number(arg.split('=')[1]) : null;

  const sql = neon(url);
  const query: Query = async (text, params) => (await sql.query(text, params ?? [])) as Record<string, unknown>[];

  console.log(`Checking ${new URL(url).host} against ${migration !== null ? `the schema as of migration ${migration}` : 'the latest src/db/schema.ts'} (read-only)...\n`);

  const report = await checkDrift(query, migration !== null ? expectedFromSnapshot(migration) : expectedFromSchema());

  if (report.notes.length) {
    console.log('Notes (not blocking):');
    report.notes.forEach((n) => console.log('  -', n));
    console.log();
  }
  if (report.errors.length === 0) {
    console.log('OK: the database matches.');
    return;
  }
  console.log(`DRIFT: ${report.errors.length} difference(s) between the database and the code:`);
  report.errors.forEach((e) => console.log('  x', e));
  console.log('\nResolve these first (fix schema.ts to match reality, or write a migration), then re-run.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
