import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { menuCategories } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { assertUuid, badRequest, handleError, notFound, parseJson } from '@/lib/http';
import { firstOutlet } from '@/lib/tenant-scope';

const createSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function GET() {
  try {
    const { tenantId } = await requireTenant();
    const categories = await db.query.menuCategories.findMany({
      where: eq(menuCategories.tenantId, tenantId),
      orderBy: (c, { asc }) => [asc(c.sortOrder)],
    });
    return NextResponse.json(categories);
  } catch (error) {
    return handleError(error, 'Failed to fetch categories');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const { name } = await parseJson(request, createSchema);

    const outlet = await firstOutlet(tenantId);
    if (!outlet) throw badRequest('No outlet found. Create a restaurant outlet first.');

    const [category] = await db.insert(menuCategories).values({ tenantId, outletId: outlet.id, name }).returning();
    return NextResponse.json({ success: true, category });
  } catch (error) {
    return handleError(error, 'Failed to create category');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const id = assertUuid(new URL(request.url).searchParams.get('id'), 'Category');

    const rows = await db.delete(menuCategories)
      .where(and(eq(menuCategories.id, id), eq(menuCategories.tenantId, tenantId)))
      .returning({ id: menuCategories.id });
    if (!rows[0]) throw notFound('Category');

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete category');
  }
}

export const dynamic = 'force-dynamic';
