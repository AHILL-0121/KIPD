import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, ilike, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { provisionTenantAndInviteOwner } from '@/lib/admin-tenants';
import { isValidTimeZone } from '@/lib/tz';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
    .min(2)
    .max(60),
  ownerEmail: z.string().trim().toLowerCase().email().max(200),
  type: z.enum(['hotel', 'restaurant', 'both']).optional().default('both'),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional().default('Asia/Kolkata'),
  plan: z.enum(['basic', 'pro', 'enterprise']).optional().default('basic'),
});

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const sp = request?.url ? new URL(request.url).searchParams : null;
    const hasPagination = Boolean(sp && (sp.has('page') || sp.has('limit')));

    if (!hasPagination) {
      const all = await db.query.tenants.findMany({
        where: isNull(tenants.deletedAt),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
      return NextResponse.json(all);
    }

    const page = Math.max(1, Number.parseInt(sp!.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp!.get('limit') || '12', 10) || 12));
    const search = (sp!.get('search') || '').trim();
    const status = sp!.get('status');
    const plan = sp!.get('plan');

    const filters: SQL[] = [];
    if (status === 'deleted') {
      filters.push(isNotNull(tenants.deletedAt));
    } else {
      filters.push(isNull(tenants.deletedAt));
      if (status && status !== 'all' && ['active', 'suspended', 'pending'].includes(status)) {
        filters.push(eq(tenants.status, status));
      }
    }

    if (plan && plan !== 'all' && ['basic', 'pro', 'enterprise'].includes(plan)) {
      filters.push(eq(tenants.plan, plan));
    }
    if (search) {
      const pattern = `%${search}%`;
      const searchCond = or(
        ilike(tenants.name, pattern),
        ilike(tenants.slug, pattern),
        ilike(tenants.ownerEmail, pattern),
      );
      if (searchCond) filters.push(searchCond);
    }

    const whereClause = and(...filters);
    const [[{ n: total }], items] = await Promise.all([
      db.select({ n: count() }).from(tenants).where(whereClause),
      db.select().from(tenants).where(whereClause).orderBy(desc(tenants.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);

    const totalNum = Number(total);
    return NextResponse.json({
      items,
      total: totalNum,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalNum / pageSize)),
    });
  } catch (error) {
    return handleError(error, 'Failed to fetch tenants');
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = await parseJson(request, schema);

    const result = await provisionTenantAndInviteOwner({
      ...parsed,
      adminClerkId: admin.userId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return handleError(error, 'Failed to create tenant');
  }
}
