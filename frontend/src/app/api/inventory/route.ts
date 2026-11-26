import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { ingredients, menuItems, recipeItems } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { firstOutlet, ownedOutlet } from '@/lib/tenant-scope';
import { computeRecipeCost, foodCostPercentage, isLowStock, stockValue } from '@/lib/inventory';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  outletId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  unit: z.enum(['g', 'kg', 'ml', 'l', 'unit', 'dozen']).optional().default('unit'),
  stockQty: z.coerce.number().min(0).max(1_000_000).default(0),
  lowStockThreshold: z.coerce.number().min(0).max(1_000_000).default(10),
  costPerUnit: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage, 'restaurant');
    const outletParam = request.nextUrl.searchParams.get('outletId');

    if (outletParam) {
      await ownedOutlet(tenantId, outletParam);
    }

    const ingFilter = outletParam
      ? and(eq(ingredients.tenantId, tenantId), eq(ingredients.outletId, outletParam))
      : eq(ingredients.tenantId, tenantId);

    const menuFilter = outletParam
      ? and(eq(menuItems.tenantId, tenantId), eq(menuItems.outletId, outletParam))
      : eq(menuItems.tenantId, tenantId);

    const [ingredientRows, recipeRows, dishRows] = await Promise.all([
      db.select().from(ingredients).where(ingFilter).orderBy(asc(ingredients.name)),
      db.select().from(recipeItems).where(eq(recipeItems.tenantId, tenantId)),
      db.select().from(menuItems).where(menuFilter).orderBy(asc(menuItems.name)),
    ]);

    const ingById = new Map(ingredientRows.map((i) => [i.id, i]));

    const formattedIngredients = ingredientRows.map((i) => ({
      id: i.id,
      outletId: i.outletId,
      name: i.name,
      unit: i.unit,
      stockQty: Number(i.stockQty),
      lowStockThreshold: Number(i.lowStockThreshold),
      costPerUnit: i.costPerUnit !== null ? Number(i.costPerUnit) : null,
      lowStock: isLowStock(i.stockQty, i.lowStockThreshold),
      stockValue: stockValue(i.stockQty, i.costPerUnit),
      updatedAt: i.updatedAt,
    }));

    const recipesByDish = dishRows.map((dish) => {
      const lines = recipeRows
        .filter((r) => r.menuItemId === dish.id)
        .map((r) => {
          const ing = ingById.get(r.ingredientId);
          return {
            ingredientId: r.ingredientId,
            ingredientName: ing?.name ?? 'Unknown',
            unit: ing?.unit ?? 'unit',
            quantityPerUnit: Number(r.quantityPerUnit),
            costPerUnit: ing?.costPerUnit !== null && ing?.costPerUnit !== undefined ? Number(ing.costPerUnit) : null,
          };
        });
      const unitCost = computeRecipeCost(lines);
      const price = Number(dish.price);
      return {
        menuItemId: dish.id,
        menuItemName: dish.name,
        outletId: dish.outletId,
        sellingPrice: price,
        unitCost,
        foodCostPct: foodCostPercentage(unitCost, price),
        margin: Math.round((price - unitCost) * 100) / 100,
        ingredients: lines,
      };
    });

    return NextResponse.json({
      ingredients: formattedIngredients,
      lowStockCount: formattedIngredients.filter((i) => i.lowStock).length,
      recipes: recipesByDish,
    });
  } catch (error) {
    return handleError(error, 'Failed to load inventory');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage, 'restaurant');
    const body = await parseJson(request, createSchema);

    const outletId = body.outletId
      ? (await ownedOutlet(tenantId, body.outletId)).id
      : (await firstOutlet(tenantId))?.id;

    if (!outletId) {
      return NextResponse.json({ error: 'No restaurant outlet found' }, { status: 400 });
    }

    const [created] = await db
      .insert(ingredients)
      .values({
        tenantId,
        outletId,
        name: body.name,
        unit: body.unit,
        stockQty: body.stockQty.toFixed(3),
        lowStockThreshold: body.lowStockThreshold.toFixed(3),
        costPerUnit: body.costPerUnit !== undefined && body.costPerUnit !== null ? body.costPerUnit.toFixed(2) : null,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        ingredient: {
          ...created,
          stockQty: Number(created.stockQty),
          lowStockThreshold: Number(created.lowStockThreshold),
          costPerUnit: created.costPerUnit !== null ? Number(created.costPerUnit) : null,
          lowStock: isLowStock(created.stockQty, created.lowStockThreshold),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error, 'Failed to create ingredient');
  }
}
