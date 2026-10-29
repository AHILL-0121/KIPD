import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Db = ReturnType<typeof create>;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(url), { schema });
}

let instance: Db | undefined;

/**
 * The database, created on first use rather than at import time.
 * Importing this file (during `next build`, in tests, in scripts that only need types) no longer
 * requires DATABASE_URL; the first real query does, and fails with a clear message if it is missing.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= create();
    const value = Reflect.get(instance as object, prop);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
