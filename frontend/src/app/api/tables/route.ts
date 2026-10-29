import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { orders, tables } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { assertUuid, badRequest, handleError, notFound, parseJson } from '@/lib/http';
import { firstOutlet, ownedTable } from '@/lib/tenant-scope';

const tableNumber = z.coerce.string().trim().min(1).max(20);
const capacity = z.coerce.number().int().min(1).max(100);

const createSchema = z.object({ tableNumber, capacity: capacity.optional().default(4) });
const patchSchema = z.object({ tableId: z.string().uuid(), tableNumber: tableNumber.optional(), capacity: capacity.optional() });

export async function GET() {
  try {
    const { tenantId } = await requireTenant();
    const all = await db.query.tables.findMany({
      where: eq(tables.tenantId, tenantId),
      with: { outlet: true },
      orderBy: (t, { asc }) => [asc(t.tableNumber)],
    });
    return NextResponse.json(all);
  } catch (error) {
    return handleError(error, 'Failed to fetch tables');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const body = await parseJson(request, createSchema);

    const outlet = await firstOutlet(tenantId);
    if (!outlet) throw badRequest('No outlet found. Set up a restaurant first.');

    // The table's QR link carries its own id, so choose the id first and store the link in one insert.
    const id = crypto.randomUUID();
    const [created] = await db.insert(tables).values({
      id,
      tenantId,
      outletId: outlet.id,
      tableNumber: body.tableNumber,
      capacity: body.capacity,
      qrCode: `/menu/${outlet.slug}/${id}`,
    }).returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleError(error, 'Failed to create table');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const body = await parseJson(request, patchSchema);
    await ownedTable(tenantId, body.tableId);

    const updates: Partial<typeof tables.$inferInsert> = {};
    if (body.tableNumber !== undefined) updates.tableNumber = body.tableNumber;
    if (body.capacity !== undefined) updates.capacity = body.capacity;
    if (Object.keys(updates).length === 0) throw badRequest('Nothing to update');

    const [updated] = await db.update(tables)
      .set(updates)
      .where(and(eq(tables.id, body.tableId), eq(tables.tenantId, tenantId)))
      .returning();
    if (!updated) throw notFound('Table');

    return NextResponse.json(updated);
  } catch (error) {
    return handleError(error, 'Failed to update table');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const id = assertUuid(new URL(request.url).searchParams.get('id'), 'Table');
    await ownedTable(tenantId, id);

    // Orders keep their history. The composite foreign key cannot "set null" a single column,
    // so unlink them first. Both steps succeed or fail together.
    await db.batch([
      db.update(orders).set({ tableId: null }).where(and(eq(orders.tableId, id), eq(orders.tenantId, tenantId))),
      db.delete(tables).where(and(eq(tables.id, id), eq(tables.tenantId, tenantId))),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete table');
  }
}

export const dynamic = 'force-dynamic';
