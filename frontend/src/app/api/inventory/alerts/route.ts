import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, lte } from 'drizzle-orm';
import { db } from '@/db';
import { ingredients } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { ownedOutlet } from '@/lib/tenant-scope';

export const dynamic = 'force-dynamic';

/** Returns all ingredients whose current stock is at or below their low-stock threshold. */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage, 'restaurant');
    const outletId = request.nextUrl.searchParams.get('outletId');
    if (outletId) await ownedOutlet(tenantId, outletId);

    const rows = await db
      .select()
      .from(ingredients)
      .where(
        and(
          eq(ingredients.tenantId, tenantId),
          outletId ? eq(ingredients.outletId, outletId) : undefined,
          lte(ingredients.stockQty, ingredients.lowStockThreshold),
        ),
      )
      .orderBy(asc(ingredients.name));

    return NextResponse.json(
      rows.map((i) => ({
        id: i.id,
        outletId: i.outletId,
        name: i.name,
        unit: i.unit,
        stockQty: Number(i.stockQty),
        lowStockThreshold: Number(i.lowStockThreshold),
      })),
    );
  } catch (error) {
    return handleError(error, 'Failed to load stock alerts');
  }
}
