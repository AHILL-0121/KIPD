import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { platformAuditLog, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { assertUuid, handleError, notFound } from '@/lib/http';
import { inviteTenantOwnerInClerk } from '@/lib/admin-tenants';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const id = assertUuid(params.id, 'Tenant');

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!tenant) throw notFound('Tenant');

    const res = await inviteTenantOwnerInClerk(tenant.id, tenant.ownerEmail);

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId,
      action: 'tenant.invite_resend',
      targetType: 'tenant',
      targetId: tenant.id,
      metadata: { tenantName: tenant.name, ownerEmail: tenant.ownerEmail, existingUser: res.existingUser },
    });

    return NextResponse.json({
      success: true,
      existingUser: res.existingUser,
      message: res.existingUser
        ? `Linked existing Clerk account ${tenant.ownerEmail} to ${tenant.name}`
        : `Sent a new owner invitation to ${tenant.ownerEmail}`,
    });
  } catch (error) {
    return handleError(error, 'Failed to resend owner invitation');
  }
}
