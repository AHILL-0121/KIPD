import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { platformAuditLog } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePlatformAdmin();
    const logs = await db
      .select()
      .from(platformAuditLog)
      .orderBy(desc(platformAuditLog.createdAt))
      .limit(50);
    return NextResponse.json(logs);
  } catch (error) {
    return handleError(error, 'Failed to fetch platform audit log');
  }
}
