import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { platformAuditLog, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { assertUuid, handleError, notFound, parseJson } from '@/lib/http';

const schema = z
  .object({
    action: z.enum(['suspend', 'activate']).optional(),
    plan: z.enum(['basic', 'pro', 'enterprise']).optional(),
  })
  .refine((d) => d.action !== undefined || d.plan !== undefined, {
    message: 'Provide action or plan',
  });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const id = assertUuid(params.id, 'Tenant');
    const { action, plan } = await parseJson(request, schema);

    const updates: Partial<typeof tenants.$inferInsert> = { updatedAt: new Date() };
    if (action) updates.status = action === 'suspend' ? 'suspended' : 'active';
    if (plan) updates.plan = plan;

    const rows = await db
      .update(tenants)
      .set(updates)
      .where(eq(tenants.id, id))
      .returning({ id: tenants.id, plan: tenants.plan, status: tenants.status });
    if (!rows[0]) throw notFound('Tenant');

    if (action) {
      await db.insert(platformAuditLog).values({
        adminClerkId: admin.userId, action: `tenant.${action}`, targetType: 'tenant', targetId: id,
      });
    }
    if (plan) {
      await db.insert(platformAuditLog).values({
        adminClerkId: admin.userId, action: 'tenant.plan_change', targetType: 'tenant', targetId: id, metadata: { plan },
      });
    }
    return NextResponse.json({ success: true, tenant: rows[0] });
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
