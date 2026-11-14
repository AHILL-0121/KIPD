import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * For uptime monitors: 200 when the app can reach its database, 503 when it cannot.
 * Public on purpose, so it says nothing else (no versions, no error text, no configuration).
 */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: 'ok', database: 'ok', ms: Date.now() - started }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Health check: database unreachable', error);
    return NextResponse.json({ status: 'degraded', database: 'unreachable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
