import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantAuditLogs } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const logs = await db
      .select()
      .from(tenantAuditLogs)
      .where(eq(tenantAuditLogs.tenantId, tenantId))
      .orderBy(desc(tenantAuditLogs.createdAt))
      .limit(50);
    return NextResponse.json(logs);
  } catch (error) {
    return handleError(error, 'Failed to fetch audit logs');
  }
}
