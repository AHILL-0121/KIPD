import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { platformAuditLog, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { assertUuid, handleError, notFound, parseJson } from '@/lib/http';

const schema = z.object({ action: z.enum(['suspend', 'activate']) });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const id = assertUuid(params.id, 'Tenant');
    const { action } = await parseJson(request, schema);

    const rows = await db.update(tenants)
      .set({ status: action === 'suspend' ? 'suspended' : 'active', updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning({ id: tenants.id });
    if (!rows[0]) throw notFound('Tenant');

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId, action: `tenant.${action}`, targetType: 'tenant', targetId: id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to update tenant');
  }
}

/**
 * "Delete" hides the tenant and blocks all access, but keeps every record (bills, orders, guests are
 * business and tax history). Nothing is removed from the database. It can be undone with PATCH activate.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const id = assertUuid(params.id, 'Tenant');

    const rows = await db.update(tenants)
      .set({ deletedAt: new Date(), status: 'suspended', updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning({ id: tenants.id });
    if (!rows[0]) throw notFound('Tenant');

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId, action: 'tenant.delete', targetType: 'tenant', targetId: id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete tenant');
  }
}
