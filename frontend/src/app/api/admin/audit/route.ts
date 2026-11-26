import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { platformAuditLog, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const dynamic = 'force-dynamic';

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const sp = request.url ? new URL(request.url).searchParams : null;
    const isRich = Boolean(
      sp &&
        (sp.has('page') ||
          sp.has('limit') ||
          sp.has('action') ||
          sp.has('search') ||
          sp.has('from') ||
          sp.has('to') ||
          sp.get('format') === 'csv'),
    );

    const tenantRows = await db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug }).from(tenants);
    const tenantMap = new Map(tenantRows.map((t) => [t.id, t]));

    if (!isRich) {
      const logs = await db
        .select()
        .from(platformAuditLog)
        .orderBy(desc(platformAuditLog.createdAt))
        .limit(50);
      return NextResponse.json(
        logs.map((l) => {
          const t = l.targetId ? tenantMap.get(l.targetId) : undefined;
          return {
            ...l,
            tenantName: t?.name ?? (l.metadata as Record<string, unknown> | null)?.tenantName ?? null,
            tenantSlug: t?.slug ?? null,
          };
        }),
      );
    }

    const page = Math.max(1, Number.parseInt(sp!.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp!.get('limit') || '25', 10) || 25));
    const action = (sp!.get('action') || '').trim();
    const search = (sp!.get('search') || '').trim();
    const fromStr = (sp!.get('from') || '').trim();
    const toStr = (sp!.get('to') || '').trim();
    const format = sp!.get('format');

    const filters: SQL[] = [];
    if (action && action !== 'all') {
      filters.push(eq(platformAuditLog.action, action));
    }
    if (fromStr) {
      const d = new Date(fromStr);
      if (!Number.isNaN(d.getTime())) filters.push(gte(platformAuditLog.createdAt, d));
    }
    if (toStr) {
      const d = new Date(toStr);
      if (!Number.isNaN(d.getTime())) filters.push(lte(platformAuditLog.createdAt, d));
    }
    if (search) {
      const pattern = `%${search}%`;
      const matchedTenantIds = tenantRows
        .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()))
        .map((t) => t.id);

      const conds: (SQL | undefined)[] = [
        ilike(platformAuditLog.action, pattern),
        ilike(platformAuditLog.adminClerkId, pattern),
        ilike(platformAuditLog.targetId, pattern),
      ];
      for (const tid of matchedTenantIds.slice(0, 20)) {
        conds.push(eq(platformAuditLog.targetId, tid));
      }
      const combined = or(...conds.filter((c): c is SQL => Boolean(c)));
      if (combined) filters.push(combined);
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    if (format === 'csv') {
      const rows = await db
        .select()
        .from(platformAuditLog)
        .where(whereClause)
        .orderBy(desc(platformAuditLog.createdAt))
        .limit(1000);

      const header = ['timestamp', 'action', 'admin_clerk_id', 'target_type', 'target_id', 'tenant_name', 'metadata'];
      const lines = [
        header.join(','),
        ...rows.map((r) => {
          const t = r.targetId ? tenantMap.get(r.targetId) : undefined;
          const tName = t?.name ?? (r.metadata as Record<string, unknown> | null)?.tenantName ?? '';
          return [
            r.createdAt.toISOString(),
            r.action,
            r.adminClerkId,
            r.targetType,
            r.targetId ?? '',
            tName,
            r.metadata ? JSON.stringify(r.metadata) : '',
          ]
            .map(csvEscape)
            .join(',');
        }),
      ];

      return new Response(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="kipd-platform-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [[{ n: total }], rows] = await Promise.all([
      db.select({ n: count() }).from(platformAuditLog).where(whereClause),
      db
        .select()
        .from(platformAuditLog)
        .where(whereClause)
        .orderBy(desc(platformAuditLog.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const items = rows.map((l) => {
      const t = l.targetId ? tenantMap.get(l.targetId) : undefined;
      return {
        ...l,
        tenantName: t?.name ?? (l.metadata as Record<string, unknown> | null)?.tenantName ?? null,
        tenantSlug: t?.slug ?? null,
      };
    });

    const totalNum = Number(total);
    return NextResponse.json({
      items,
      total: totalNum,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalNum / pageSize)),
    });
  } catch (error) {
    return handleError(error, 'Failed to fetch platform audit log');
  }
}
