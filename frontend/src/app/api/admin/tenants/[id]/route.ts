import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, bookings, orders, outlets, payments, platformAuditLog, properties, staff, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { assertUuid, handleError, notFound, parseJson } from '@/lib/http';
import { getTenantPlanUsage } from '@/lib/plan-limits';
import { isValidTimeZone } from '@/lib/tz';

const patchSchema = z
  .object({
    action: z.enum(['suspend', 'activate']).optional(),
    plan: z.enum(['basic', 'pro', 'enterprise']).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    type: z.enum(['hotel', 'restaurant', 'both']).optional(),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional(),
    ownerEmail: z.string().trim().toLowerCase().email().max(200).optional(),
  })
  .refine(
    (d) =>
      d.action !== undefined ||
      d.plan !== undefined ||
      d.name !== undefined ||
      d.type !== undefined ||
      d.timezone !== undefined ||
      d.ownerEmail !== undefined,
    { message: 'Provide at least one field to update' },
  );

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePlatformAdmin();
    const id = assertUuid(params.id, 'Tenant');

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!tenant) throw notFound('Tenant');

    const [
      usageInfo,
      tenantProperties,
      tenantOutlets,
      [staffRow],
      [bookingStats],
      [orderStats],
      [billStats],
      recentAudit,
    ] = await Promise.all([
      getTenantPlanUsage(id),
      db.select({ id: properties.id, name: properties.name, email: properties.email }).from(properties).where(eq(properties.tenantId, id)),
      db.select({ id: outlets.id, name: outlets.name, slug: outlets.slug, type: outlets.type, isActive: outlets.isActive }).from(outlets).where(eq(outlets.tenantId, id)),
      db.select({ n: count() }).from(staff).where(eq(staff.tenantId, id)),
      db.select({ n: count(), lastAt: sql<string | null>`max(${bookings.createdAt})` }).from(bookings).where(eq(bookings.tenantId, id)),
      db.select({ n: count(), lastAt: sql<string | null>`max(${orders.createdAt})` }).from(orders).where(eq(orders.tenantId, id)),
      db.select({ totalPaid: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments).where(eq(payments.tenantId, id)),
      db.select().from(platformAuditLog).where(eq(platformAuditLog.targetId, id)).orderBy(desc(platformAuditLog.createdAt)).limit(20),
    ]);

    let ownerClerkStatus: 'linked' | 'pending_invite' | 'unlinked' = 'unlinked';
    try {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (secretKey) {
        const clerk = createClerkClient({ secretKey });
        const existingUsers = await clerk.users.getUserList({ emailAddress: [tenant.ownerEmail] });
        if (existingUsers.data.length > 0) {
          ownerClerkStatus = 'linked';
        } else if (clerk.invitations?.getInvitationList) {
          const invList = await clerk.invitations.getInvitationList({ status: 'pending' });
          const hasPending = invList.data.some((i) => i.emailAddress?.toLowerCase() === tenant.ownerEmail.toLowerCase());
          if (hasPending) ownerClerkStatus = 'pending_invite';
        }
      }
    } catch {
      /* ignore Clerk unavailability in tests */
    }

    // Also include unpaid bill count cleanly
    const [openBillRow] = await db
      .select({ n: count() })
      .from(bills)
      .where(and(eq(bills.tenantId, id), isNull(bills.settledAt)));

    return NextResponse.json({
      tenant,
      usage: usageInfo.usage,
      limits: usageInfo.limits,
      properties: tenantProperties,
      outlets: tenantOutlets,
      metrics: {
        staffCount: Number(staffRow?.n ?? 0),
        bookingsCount: Number(bookingStats?.n ?? 0),
        lastBookingAt: bookingStats?.lastAt ?? null,
        ordersCount: Number(orderStats?.n ?? 0),
        lastOrderAt: orderStats?.lastAt ?? null,
        totalCollected: Number(billStats?.totalPaid ?? 0),
        openBillsCount: Number(openBillRow?.n ?? 0),
      },
      ownerClerkStatus,
      recentAudit,
    });
  } catch (error) {
    return handleError(error, 'Failed to fetch tenant details');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const id = assertUuid(params.id, 'Tenant');
    const body = await parseJson(request, patchSchema);

    const updates: Partial<typeof tenants.$inferInsert> = { updatedAt: new Date() };
    if (body.action === 'suspend') updates.status = 'suspended';
    if (body.action === 'activate') {
      updates.status = 'active';
      updates.deletedAt = null;
    }
    if (body.plan) updates.plan = body.plan;
    if (body.name) updates.name = body.name;
    if (body.type) updates.type = body.type;
    if (body.timezone) updates.timezone = body.timezone;
    if (body.ownerEmail) updates.ownerEmail = body.ownerEmail;

    const rows = await db
      .update(tenants)
      .set(updates)
      .where(eq(tenants.id, id))
      .returning({
        id: tenants.id,
        name: tenants.name,
        type: tenants.type,
        timezone: tenants.timezone,
        ownerEmail: tenants.ownerEmail,
        plan: tenants.plan,
        status: tenants.status,
        deletedAt: tenants.deletedAt,
      });
    if (!rows[0]) throw notFound('Tenant');

    if (body.action) {
      await db.insert(platformAuditLog).values({
        adminClerkId: admin.userId,
        action: `tenant.${body.action}`,
        targetType: 'tenant',
        targetId: id,
        metadata: { tenantName: rows[0].name },
      });
    }
    if (body.plan) {
      await db.insert(platformAuditLog).values({
        adminClerkId: admin.userId,
        action: 'tenant.plan_change',
        targetType: 'tenant',
        targetId: id,
        metadata: { plan: body.plan, tenantName: rows[0].name },
      });
    }
    if (body.name || body.type || body.timezone || body.ownerEmail) {
      await db.insert(platformAuditLog).values({
        adminClerkId: admin.userId,
        action: 'tenant.update',
        targetType: 'tenant',
        targetId: id,
        metadata: {
          tenantName: rows[0].name,
          fields: Object.keys(body).filter((k) => k !== 'action' && k !== 'plan'),
        },
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

    const rows = await db
      .update(tenants)
      .set({ deletedAt: new Date(), status: 'suspended', updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning({ id: tenants.id, name: tenants.name });
    if (!rows[0]) throw notFound('Tenant');

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId,
      action: 'tenant.delete',
      targetType: 'tenant',
      targetId: id,
      metadata: { tenantName: rows[0].name },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete tenant');
  }
}
