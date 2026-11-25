import { NextRequest, NextResponse } from 'next/server';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { outlets } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, assertUuid, badRequest, handleError, notFound, parseJson } from '@/lib/http';
import { enforcePlanLimit } from '@/lib/plan-limits';
import { firstProperty } from '@/lib/tenant-scope';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['restaurant', 'bar', 'cafe', 'room_service']).optional().default('restaurant'),
});

function toSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${base || 'outlet'}-${suffix}`;
}

export async function GET() {
  try {
    const { tenantId } = await requireTenant(undefined, 'restaurant');
    const list = await db
      .select()
      .from(outlets)
      .where(eq(outlets.tenantId, tenantId))
      .orderBy(outlets.createdAt);
    return NextResponse.json(list);
  } catch (error) {
    return handleError(error, 'Failed to fetch outlets');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const { name, type } = await parseJson(request, createSchema);

    await enforcePlanLimit(tenantId, 'outlets');

    const property = await firstProperty(tenantId);
    if (!property) throw badRequest('No property found for this tenant.');

    const [created] = await db
      .insert(outlets)
      .values({
        tenantId,
        propertyId: property.id,
        name,
        slug: toSlug(name),
        type,
        isActive: true,
      })
      .returning();

    return NextResponse.json({ success: true, outlet: created }, { status: 201 });
  } catch (error) {
    return handleError(error, 'Failed to create outlet');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const id = assertUuid(new URL(request.url).searchParams.get('id'), 'Outlet');

    const [{ n }] = await db
      .select({ n: count() })
      .from(outlets)
      .where(eq(outlets.tenantId, tenantId));
    if (Number(n) <= 1) {
      throw new HttpError(409, 'You must keep at least one outlet.');
    }

    const deleted = await db
      .delete(outlets)
      .where(and(eq(outlets.id, id), eq(outlets.tenantId, tenantId)))
      .returning({ id: outlets.id });
    if (!deleted[0]) throw notFound('Outlet');

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete outlet');
  }
}
