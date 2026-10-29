import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { menuItems } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { assertUuid, handleError, notFound, parseJson } from '@/lib/http';
import { ownedCategory } from '@/lib/tenant-scope';

const price = z.coerce.number().positive().max(1_000_000);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional().default(''),
  price,
  categoryId: z.string().uuid(),
  tags: z.array(z.string().max(30)).max(10).optional().default([]),
});

// Only these fields can ever be changed. Anything else in the body is dropped.
const patchSchema = z.object({
  menuItemId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  price: price.optional(),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  isAvailable: z.boolean().optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export async function GET() {
  try {
    const { tenantId } = await requireTenant();
    const items = await db.query.menuItems.findMany({
      where: eq(menuItems.tenantId, tenantId),
      with: { category: true },
      orderBy: (m, { asc }) => [asc(m.name)],
    });
    return NextResponse.json(items);
  } catch (error) {
    return handleError(error, 'Failed to fetch menu items');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const body = await parseJson(request, createSchema);

    // The item lives in the same outlet as its category (and the category must be ours).
    const category = await ownedCategory(tenantId, body.categoryId);

    const [menuItem] = await db.insert(menuItems).values({
      tenantId,
      name: body.name,
      description: body.description,
      price: body.price.toFixed(2),
      categoryId: category.id,
      outletId: category.outletId,
      tags: body.tags,
      isAvailable: true,
    }).returning();

    return NextResponse.json({ success: true, menuItem });
  } catch (error) {
    return handleError(error, 'Failed to create menu item');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const { menuItemId, price: newPrice, categoryId, ...rest } = await parseJson(request, patchSchema);

    const updates: Partial<typeof menuItems.$inferInsert> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) (updates as Record<string, unknown>)[key] = value;
    }
    if (newPrice !== undefined) updates.price = newPrice.toFixed(2);
    if (categoryId !== undefined) {
      const category = await ownedCategory(tenantId, categoryId);
      updates.categoryId = category.id;
      updates.outletId = category.outletId;
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ success: true });

    const rows = await db.update(menuItems)
      .set(updates)
      .where(and(eq(menuItems.id, menuItemId), eq(menuItems.tenantId, tenantId)))
      .returning({ id: menuItems.id });
    if (!rows[0]) throw notFound('Menu item');

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to update menu item');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const id = assertUuid(new URL(request.url).searchParams.get('id'), 'Menu item');

    const rows = await db.delete(menuItems)
      .where(and(eq(menuItems.id, id), eq(menuItems.tenantId, tenantId)))
      .returning({ id: menuItems.id });
    if (!rows[0]) throw notFound('Menu item');

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete menu item');
  }
}

export const dynamic = 'force-dynamic';
