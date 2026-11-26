import { NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { getMaintenanceState } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePlatformAdmin();

    const dbStart = Date.now();
    let dbOk = false;
    let dbMs = 0;
    let migrationsCount: number | null = null;
    try {
      await db.execute(sql`select 1`);
      dbMs = Date.now() - dbStart;
      dbOk = true;
      try {
        const res = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
        const first = (res as unknown as { rows?: Array<{ n?: number }> })?.rows?.[0]
          ?? (Array.isArray(res) ? (res[0] as { n?: number } | undefined) : undefined);
        if (first && typeof first.n === 'number') migrationsCount = first.n;
      } catch {
        migrationsCount = null;
      }
    } catch {
      dbOk = false;
      dbMs = Date.now() - dbStart;
    }

    const clerkStart = Date.now();
    let clerkOk = false;
    let clerkMs = 0;
    try {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (secretKey) {
        const clerk = createClerkClient({ secretKey });
        await clerk.users.getUserList({ limit: 1 });
        clerkOk = true;
      }
    } catch {
      clerkOk = false;
    } finally {
      clerkMs = Date.now() - clerkStart;
    }

    const maintenance = await getMaintenanceState();

    const integrations = {
      database: Boolean(process.env.DATABASE_URL || dbOk),
      clerkAuth: Boolean(process.env.CLERK_SECRET_KEY),
      clerkWebhook: Boolean(process.env.CLERK_WEBHOOK_SECRET),
      upstashRedis: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
      smtpEmail: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      contactAdminEmail: Boolean(process.env.CONTACT_ADMIN_EMAIL),
      paymentEncryptionKey: Boolean(process.env.PAYMENT_KEYS_SECRET),
      sentryMonitoring: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN),
    };

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      database: { ok: dbOk, latencyMs: dbMs, migrationsCount },
      clerk: { ok: clerkOk, latencyMs: clerkMs },
      maintenance,
      integrations,
    });
  } catch (error) {
    return handleError(error, 'Failed to check system health');
  }
}
