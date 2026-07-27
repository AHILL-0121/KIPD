import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { menuCategories, outlets, properties } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    const tenantProperties = await db.query.properties.findMany({
      where: eq(properties.tenantId, tenantId),
    });
    if (tenantProperties.length === 0) return NextResponse.json([]);

    const propertyIds = tenantProperties.map(p => p.id);
    const tenantOutlets = await db.query.outlets.findMany({
      where: inArray(outlets.propertyId, propertyIds),
    });
    if (tenantOutlets.length === 0) return NextResponse.json([]);

    const outletIds = tenantOutlets.map(o => o.id);
    const categories = await db.query.menuCategories.findMany({
      where: inArray(menuCategories.outletId, outletIds),
      orderBy: (cat, { asc }) => [asc(cat.sortOrder)],
    });

    return NextResponse.json(categories);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    // Get first outlet
    const tenantProperties = await db.query.properties.findMany({
      where: eq(properties.tenantId, tenantId),
    });
    if (tenantProperties.length === 0) {
      return NextResponse.json({ error: 'No property found' }, { status: 400 });
    }

    const tenantOutlets = await db.query.outlets.findMany({
      where: inArray(outlets.propertyId, tenantProperties.map(p => p.id)),
    });
    if (tenantOutlets.length === 0) {
      return NextResponse.json({ error: 'No outlet found. Create a restaurant outlet first.' }, { status: 400 });
    }

    const [category] = await db.insert(menuCategories).values({
      outletId: tenantOutlets[0].id,
      name,
    }).returning();

    return NextResponse.json({ success: true, category });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireTenantContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Category ID required' }, { status: 400 });
    }

    await db.delete(menuCategories).where(eq(menuCategories.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
