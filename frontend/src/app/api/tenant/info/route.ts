import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tenants, properties, outlets } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    if (!tenantId) {
      if (context.isPlatformAdmin) {
        return NextResponse.json({
          id: '',
          name: '',
          slug: '',
          type: 'both',
          plan: '',
          status: 'active',
          role: 'platform_admin',
          userName: context.userName,
          areas: 'both',
          isPlatformAdmin: true,
          impersonating: false,
          outlets: [],
        });
      }
      return NextResponse.json({ error: 'No tenant' }, { status: 401 });
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get outlets for KDS and other features
    const tenantProperties = await db.query.properties.findMany({
      where: eq(properties.tenantId, tenantId),
    });
    const propertyIds = tenantProperties.map(p => p.id);
    const tenantOutlets = propertyIds.length > 0
      ? await db.query.outlets.findMany({ where: inArray(outlets.propertyId, propertyIds) })
      : [];

    return NextResponse.json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      type: tenant.type,
      plan: tenant.plan,
      status: tenant.status,
      role: context.role,
      userName: context.userName,
      areas: context.areas ?? 'both',
      impersonating: Boolean(context.isImpersonating),
      outlets: tenantOutlets.map(o => ({ id: o.id, name: o.name })),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
