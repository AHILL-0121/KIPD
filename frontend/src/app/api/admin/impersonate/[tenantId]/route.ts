import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { platformAuditLog, tenants } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth';
import { assertUuid, handleError, notFound } from '@/lib/http';
import { IMPERSONATE_COOKIE, signImpersonateToken, verifyImpersonateToken } from '@/lib/impersonate';

export const dynamic = 'force-dynamic';

function clearAuthCacheFor(userId: string) {
  const g = globalThis as { authCache?: Map<string, unknown> };
  g.authCache?.delete(userId);
}

/**
 * Starts tenant impersonation for a platform admin and logs the action in platform_audit_log.
 */
export async function POST(request: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const tenantId = assertUuid(params.tenantId, 'Tenant');

    const [tenant] = await db
      .select({ id: tenants.id, name: tenants.name, status: tenants.status })
      .from(tenants)
      .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
      .limit(1);

    if (!tenant) throw notFound('Tenant');

    const token = await signImpersonateToken(tenant.id, admin.userId);
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    await db.insert(platformAuditLog).values({
      adminClerkId: admin.userId,
      action: 'tenant.impersonate_start',
      targetType: 'tenant',
      targetId: tenant.id,
      metadata: {
        tenantName: tenant.name,
        ip: forwardedFor,
      },
    });

    clearAuthCacheFor(admin.userId);

    const res = NextResponse.json({
      success: true,
      redirectUrl: '/dashboard',
      tenant: { id: tenant.id, name: tenant.name },
    });
    res.cookies.set(IMPERSONATE_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 30,
    });
    return res;
  } catch (error) {
    return handleError(error, 'Failed to start impersonation');
  }
}

/**
 * Ends active tenant impersonation and logs the exit in platform_audit_log.
 */
export async function DELETE(request: NextRequest, { params }: { params: { tenantId: string } }) {
  try {
    const admin = await requirePlatformAdmin();
    const existing = request.cookies.get(IMPERSONATE_COOKIE)?.value;
    const verifiedTenantId = await verifyImpersonateToken(existing, admin.userId);
    const targetId = verifiedTenantId ?? (params.tenantId !== 'current' ? params.tenantId : null);

    if (targetId) {
      await db.insert(platformAuditLog).values({
        adminClerkId: admin.userId,
        action: 'tenant.impersonate_end',
        targetType: 'tenant',
        targetId,
      });
    }

    clearAuthCacheFor(admin.userId);

    const res = NextResponse.json({ success: true, redirectUrl: '/admin/tenants' });
    res.cookies.delete(IMPERSONATE_COOKIE);
    return res;
  } catch (error) {
    return handleError(error, 'Failed to end impersonation');
  }
}
