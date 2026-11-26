import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { accessRequests } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const sp = new URL(request.url).searchParams;
    const status = (sp.get('status') || 'all').trim();
    const search = (sp.get('search') || '').trim();

    const filters: SQL[] = [];
    if (status && status !== 'all' && ['pending', 'approved', 'rejected'].includes(status)) {
      filters.push(eq(accessRequests.status, status));
    }
    if (search) {
      const pattern = `%${search}%`;
      const cond = or(
        ilike(accessRequests.name, pattern),
        ilike(accessRequests.email, pattern),
        ilike(accessRequests.company, pattern),
      );
      if (cond) filters.push(cond);
    }

    const rows = await db
      .select()
      .from(accessRequests)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(accessRequests.createdAt))
      .limit(100);

    return NextResponse.json({ items: rows });
  } catch (error) {
    return handleError(error, 'Failed to load access requests');
  }
}
