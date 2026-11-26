import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { paymentEvents, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePlatformAdmin();

    const [events, tenantList] = await Promise.all([
      db.select().from(paymentEvents).orderBy(desc(paymentEvents.createdAt)).limit(100),
      db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug }).from(tenants),
    ]);

    const tenantMap = new Map(tenantList.map((t) => [t.id, t]));

    return NextResponse.json({
      paymentEvents: events.map((ev) => {
        const t = tenantMap.get(ev.tenantId);
        return {
          id: ev.id,
          tenantId: ev.tenantId,
          tenantName: t?.name ?? 'Unknown tenant',
          tenantSlug: t?.slug ?? null,
          source: ev.source,
          sourceApp: ev.sourceApp,
          parsedAmount: ev.parsedAmount,
          parsedReference: ev.parsedReference,
          matchedBillId: ev.matchedBillId,
          matchConfidence: ev.matchConfidence,
          rawPayload: ev.rawPayload,
          createdAt: ev.createdAt,
        };
      }),
    });
  } catch (error) {
    return handleError(error, 'Failed to load system diagnostics');
  }
}
