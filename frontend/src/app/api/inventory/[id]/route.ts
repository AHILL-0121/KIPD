import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { ingredients } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, assertUuid, handleError, notFound, parseJson } from '@/lib/http';
import { ownedIngredient } from '@/lib/tenant-scope';
import { isLowStock } from '@/lib/inventory';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  unit: z.enum(['g', 'kg', 'ml', 'l', 'unit', 'dozen']).optional(),
  stockQty: z.coerce.number().min(0).max(1_000_000).optional(),
  deltaQty: z.coerce.number().min(-1_000_000).max(1_000_000).optional(),
  lowStockThreshold: z.coerce.number().min(0).max(1_000_000).optional(),
  costPerUnit: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage, 'restaurant');
    const existing = await ownedIngredient(tenantId, params.id);
    const body = await parseJson(request, patchSchema);

    let nextStock = Number(existing.stockQty);
    if (body.stockQty !== undefined) {
      nextStock = body.stockQty;
    } else if (body.deltaQty !== undefined) {
      nextStock = Math.max(0, nextStock + body.deltaQty);
    }

    if (nextStock < 0) throw new HttpError(400, 'Stock quantity cannot be negative');

    const [updated] = await db
      .update(ingredients)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.unit !== undefined ? { unit: body.unit } : {}),
        ...(body.stockQty !== undefined || body.deltaQty !== undefined ? { stockQty: nextStock.toFixed(3) } : {}),
        ...(body.lowStockThreshold !== undefined ? { lowStockThreshold: body.lowStockThreshold.toFixed(3) } : {}),
        ...(body.costPerUnit !== undefined
          ? { costPerUnit: body.costPerUnit !== null ? body.costPerUnit.toFixed(2) : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(ingredients.id, existing.id), eq(ingredients.tenantId, tenantId)))
      .returning();

    return NextResponse.json({
      success: true,
      ingredient: {
        ...updated,
        stockQty: Number(updated.stockQty),
        lowStockThreshold: Number(updated.lowStockThreshold),
        costPerUnit: updated.costPerUnit !== null ? Number(updated.costPerUnit) : null,
        lowStock: isLowStock(updated.stockQty, updated.lowStockThreshold),
      },
    });
  } catch (error) {
    return handleError(error, 'Failed to update ingredient');
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage, 'restaurant');
    const id = assertUuid(params.id, 'Ingredient');

    const deleted = await db
      .delete(ingredients)
      .where(and(eq(ingredients.id, id), eq(ingredients.tenantId, tenantId)))
      .returning({ id: ingredients.id });

    if (!deleted[0]) throw notFound('Ingredient');
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete ingredient');
  }
}
