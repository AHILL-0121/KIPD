import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { menuCategories, menuItems, tables } from '@/db/schema';
import { assertUuid, handleError, notFound } from '@/lib/http';
import { resolveOutlet } from '@/lib/public';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * The guest-facing menu for one outlet. No login.
 * Shows only dishes that are switched on, and never exposes tenant, outlet or internal ids beyond the
 * dish ids the guest needs in order to order.
 */
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    await enforceRateLimit(request, 'pub-menu', 90, 60);
    const { outlet, tenant } = await resolveOutlet(params.slug);

    // The table is optional for browsing, but if given it must be a real table of THIS outlet.
    let table: { number: string } | null = null;
    const tableParam = request.nextUrl.searchParams.get('table');
    if (tableParam) {
      assertUuid(tableParam, 'Table');
      const [t] = await db.select({ tableNumber: tables.tableNumber }).from(tables)
        .where(and(eq(tables.id, tableParam), eq(tables.outletId, outlet.id), eq(tables.tenantId, tenant.id))).limit(1);
      if (!t) throw notFound('Table');
      table = { number: t.tableNumber };
    }

    const [categories, items] = await Promise.all([
      db.select().from(menuCategories).where(and(eq(menuCategories.outletId, outlet.id), eq(menuCategories.tenantId, tenant.id))),
      db.select().from(menuItems).where(and(eq(menuItems.outletId, outlet.id), eq(menuItems.tenantId, tenant.id), eq(menuItems.isAvailable, true))),
    ]);

    const byOrder = <T extends { sortOrder: number | null; name: string }>(a: T, b: T) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
    const result = categories.sort(byOrder)
      .map((c) => ({
        id: c.id,
        name: c.name,
        items: items.filter((i) => i.categoryId === c.id).sort(byOrder).map((i) => ({
          id: i.id, name: i.name, description: i.description ?? '', price: Number(i.price), tags: i.tags ?? [], imageUrl: i.imageUrl,
        })),
      }))
      .filter((c) => c.items.length > 0); // an empty section is just noise to a guest

    return NextResponse.json({ restaurant: { name: outlet.name }, table, categories: result });
  } catch (error) {
    return handleError(error, 'Could not load the menu');
  }
}
