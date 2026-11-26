import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { ingredients, recipeItems } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { badRequest, handleError, parseJson } from '@/lib/http';
import { ownedMenuItems } from '@/lib/tenant-scope';
import { computeRecipeCost } from '@/lib/inventory';

const recipeSchema = z.object({
  menuItemId: z.string().uuid(),
  items: z.array(z.object({
    ingredientId: z.string().uuid(),
    quantityPerUnit: z.coerce.number().positive().max(100_000),
  })).max(50),
});

/** Replaces the ingredient recipe mapping for a menu item and returns its updated unit food cost. */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage, 'restaurant');
    const body = await parseJson(request, recipeSchema);

    const [dish] = await ownedMenuItems(tenantId, [body.menuItemId]);
    if (!dish) throw badRequest('Menu item not found');

    // Deduplicate ingredient IDs and ensure every ingredient belongs to this tenant.
    const uniqueByIng = new Map<string, number>();
    for (const item of body.items) {
      uniqueByIng.set(item.ingredientId, item.quantityPerUnit);
    }
    const ingIds = Array.from(uniqueByIng.keys());
    const foundIngs = ingIds.length
      ? await db.select().from(ingredients).where(and(eq(ingredients.tenantId, tenantId), inArray(ingredients.id, ingIds)))
      : [];

    if (foundIngs.length !== ingIds.length) {
      throw badRequest('One or more selected ingredients were not found');
    }

    if (ingIds.length > 0) {
      await db.batch([
        db.delete(recipeItems).where(and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.menuItemId, dish.id))),
        db.insert(recipeItems).values(
          ingIds.map((ingredientId) => ({
            tenantId,
            menuItemId: dish.id,
            ingredientId,
            quantityPerUnit: uniqueByIng.get(ingredientId)!.toFixed(3),
          })),
        ),
      ]);
    } else {
      await db.delete(recipeItems).where(and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.menuItemId, dish.id)));
    }

    const ingMap = new Map(foundIngs.map((i) => [i.id, i]));
    const unitCost = computeRecipeCost(
      ingIds.map((id) => ({
        quantityPerUnit: uniqueByIng.get(id)!,
        costPerUnit: ingMap.get(id)?.costPerUnit,
      })),
    );

    return NextResponse.json({
      success: true,
      menuItemId: dish.id,
      unitCost,
      ingredientCount: ingIds.length,
    });
  } catch (error) {
    return handleError(error, 'Failed to save recipe costing');
  }
}
