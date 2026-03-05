import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tables, outlets, properties } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

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
    if (outletIds.length === 0) return NextResponse.json([]);

    const allTables = await db.query.tables.findMany({
      where: inArray(tables.outletId, outletIds),
      with: { outlet: true },
      orderBy: (tables, { asc }) => [asc(tables.tableNumber)],
    });

    return NextResponse.json(allTables);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch tables' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    if (!['owner', 'manager'].includes(context.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { tableNumber, capacity } = body;

    if (!tableNumber) {
      return NextResponse.json({ error: 'Table number is required' }, { status: 400 });
    }

    const outletIds = await getTenantOutletIds(context.tenantId);
    if (outletIds.length === 0) {
      return NextResponse.json({ error: 'No outlet found. Set up a restaurant first.' }, { status: 400 });
    }

    // Get outlet + slug for QR code URL
    const outlet = await db.query.outlets.findFirst({
      where: eq(outlets.id, outletIds[0]),
    });

    const [newTable] = await db.insert(tables).values({
      outletId: outletIds[0],
      tableNumber: String(tableNumber),
      capacity: capacity || 4,
    }).returning();

    // Generate QR code URL: /menu/[outletSlug]/[tableId]
    const qrUrl = `/menu/${outlet?.slug || 'restaurant'}/${newTable.id}`;
    const [updated] = await db.update(tables)
      .set({ qrCode: qrUrl })
      .where(eq(tables.id, newTable.id))
      .returning();

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error('Create table error:', error);
    return NextResponse.json({ error: 'Failed to create table' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    if (!['owner', 'manager'].includes(context.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { tableId, tableNumber, capacity } = body;

    if (!tableId) {
      return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });
    }

    // Verify table belongs to tenant
    const outletIds = await getTenantOutletIds(context.tenantId);
    const table = await db.query.tables.findFirst({
      where: eq(tables.id, tableId),
    });
    if (!table || !outletIds.includes(table.outletId)) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const updates: Record<string, any> = {};
    if (tableNumber !== undefined) updates.tableNumber = String(tableNumber);
    if (capacity !== undefined) updates.capacity = capacity;

    const [updated] = await db.update(tables)
      .set(updates)
      .where(eq(tables.id, tableId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update table' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    if (!['owner', 'manager'].includes(context.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tableId = searchParams.get('id');
    if (!tableId) {
      return NextResponse.json({ error: 'Table ID required' }, { status: 400 });
    }

    // Verify table belongs to tenant
    const outletIds = await getTenantOutletIds(context.tenantId);
    const table = await db.query.tables.findFirst({
      where: eq(tables.id, tableId),
    });
    if (!table || !outletIds.includes(table.outletId)) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    await db.delete(tables).where(eq(tables.id, tableId));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete table' }, { status: 500 });
  }
}
