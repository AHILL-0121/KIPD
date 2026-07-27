import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { menuItems, menuCategories, outlets, properties } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

// Helper to get outlet IDs for tenant
async function getTenantOutletIds(tenantId: string): Promise<string[]> {
  const tenantProperties = await db.query.properties.findMany({
    where: eq(properties.tenantId, tenantId),
  });
  if (tenantProperties.length === 0) return [];
  
  const propertyIds = tenantProperties.map(p => p.id);
  const tenantOutlets = await db.query.outlets.findMany({
    where: inArray(outlets.propertyId, propertyIds),
  });
  return tenantOutlets.map(o => o.id);
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const outletIds = await getTenantOutletIds(context.tenantId);

    if (outletIds.length === 0) {
      return NextResponse.json([]);
    }

    const allMenuItems = await db.query.menuItems.findMany({
      where: inArray(menuItems.outletId, outletIds),
      with: { category: true },
      orderBy: (menuItems, { asc }) => [asc(menuItems.name)],
    });

    return NextResponse.json(allMenuItems);
  } catch (error) {
    console.error('Get menu items error:', error);
    return NextResponse.json({ error: 'Failed to fetch menu items' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const body = await request.json();
    const { name, description, price, categoryId, tags } = body;

    if (!name || !price || !categoryId) {
      return NextResponse.json({ error: 'Name, price, and category are required' }, { status: 400 });
    }

    // Get the first outlet for this tenant
    const outletIds = await getTenantOutletIds(context.tenantId);
    if (outletIds.length === 0) {
      return NextResponse.json({ error: 'No restaurant outlet found' }, { status: 400 });
    }

    const [menuItem] = await db.insert(menuItems).values({
      name,
      description: description || '',
      price: price.toString(),
      categoryId,
      outletId: outletIds[0],
      tags: tags || [],
      isAvailable: true,
    }).returning();

    return NextResponse.json({ success: true, menuItem });
  } catch (error) {
    console.error('Create menu item error:', error);
    return NextResponse.json({ error: 'Failed to create menu item' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireTenantContext();
    const body = await request.json();
    const { menuItemId, ...updates } = body;

    if (!menuItemId) {
      return NextResponse.json({ error: 'Menu item ID required' }, { status: 400 });
    }

    await db.update(menuItems)
      .set(updates)
      .where(eq(menuItems.id, menuItemId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update menu item error:', error);
    return NextResponse.json({ error: 'Failed to update menu item' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireTenantContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Menu item ID required' }, { status: 400 });
    }

    await db.delete(menuItems).where(eq(menuItems.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete menu item error:', error);
    return NextResponse.json({ error: 'Failed to delete menu item' }, { status: 500 });
  }
}
