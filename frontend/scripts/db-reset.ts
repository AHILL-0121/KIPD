/**
 * DESTRUCTIVE. Deletes EVERY table and ALL data in the database named by DATABASE_URL (.env.local),
 * then you rebuild it with `npm run db:migrate`.
 *
 *   npm run db:reset                                  # shows what would be deleted, deletes nothing
 *   npm run db:reset -- --confirm=<the database host> # actually deletes (the host is printed by the line above)
 *
 * Afterwards:
 *   npm run db:migrate    # recreate every table
 *   npm run db:drift      # must say OK
 * Then recreate your tenants from the platform admin screen. Logins live in Clerk and are NOT touched.
 * Owners whose Clerk profile points at a tenant that no longer exists are relinked when the tenant is recreated.
 */
import * as dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { assertConfirmed, describeData, hostOf, resetDatabase, type Query } from './db-lib';

dotenv.config({ path: '.env.local' });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (.env.local)');
  // `npm run db:reset --confirm=x` (without the extra `--`) is swallowed by npm and arrives as an
  // environment variable instead, so accept both. The exact host still has to be typed either way.
  const confirm = process.argv.find((a) => a.startsWith('--confirm='))?.slice('--confirm='.length)
    ?? process.env.npm_config_confirm;

  const sql = neon(url);
  const query: Query = async (text, params) => (await sql.query(text, params ?? [])) as Record<string, unknown>[];

  console.log(`Database host: ${hostOf(url)}\n`);
  const data = await describeData(query);
  if (data.length === 0) console.log('The database has no tables.');
  else {
    console.log('This would permanently delete:');
    data.forEach((d) => console.log(`  ${d.table.padEnd(28)} ${String(d.rows).padStart(7)} row(s)`));
    console.log(`  ${'TOTAL'.padEnd(28)} ${String(data.reduce((n, d) => n + d.rows, 0)).padStart(7)} row(s)\n`);
  }

  try {
    assertConfirmed(url, confirm);
  } catch {
    console.log('Nothing was deleted. To delete everything above, run exactly:\n');
    console.log(`  npm run db:reset -- --confirm=${hostOf(url)}\n`);
    console.log('(the "--" before --confirm matters)');
    process.exit(1);
  }
  await resetDatabase(query);
  console.log('Done. The database is empty. Now run: npm run db:migrate');
}

main().catch((e) => {
  console.error('\n' + (e instanceof Error ? e.message : e));
  process.exit(1);
});
