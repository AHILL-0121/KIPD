import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * `drizzle-kit generate` only reads src/db/schema.ts and needs no database.
 * `migrate` / `push` / `studio` do connect, and fail with a clear connection error if the URL is missing.
 *
 * Workflow (see scripts/db-*.ts):
 *   1. edit src/db/schema.ts
 *   2. npm run db:generate      -> writes drizzle/NNNN_name.sql   (review it, commit it)
 *   3. npm run db:drift         -> read-only: does the live database match what we think it is?
 *   4. npm run db:migrate       -> applies pending migrations, in order, each in a transaction
 * Do not use `db:push` against production: it changes the database without leaving a record.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://DATABASE_URL_IS_NOT_SET@localhost:5432/none',
  },
});
