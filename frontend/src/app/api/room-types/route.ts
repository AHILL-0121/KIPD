import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { roomTypes } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { assertUuid, badRequest, handleError, notFound, parseJson } from '@/lib/http';
import { firstProperty } from '@/lib/tenant-scope';

const basePrice = z.coerce.number().positive().max(10_000_000);
const fields = {
  name: z.string().trim().min(1).max(80),
  basePrice,
  maxOccupancy: z.coerce.number().int().min(1).max(20),
  amenities: z.array(z.string().max(40)).max(30),
  description: z.string().max(500),
};

const createSchema = z.object({
  name: fields.name,
  basePrice: fields.basePrice,
  maxOccupancy: fields.maxOccupancy.optional().default(2),
  amenities: fields.amenities.optional().default([]),
  description: fields.description.optional().default(''),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: fields.name.optional(),
  basePrice: fields.basePrice.optional(),
  maxOccupancy: fields.maxOccupancy.optional(),
  amenities: fields.amenities.optional(),
  description: fields.description.optional(),
});

export async function GET() {
  try {
    const { tenantId } = await requireTenant();
    const all = await db.query.roomTypes.findMany({
      where: eq(roomTypes.tenantId, tenantId),
      orderBy: (t, { asc }) => [asc(t.name)],
    });
    return NextResponse.json(all);
  } catch (error) {
    return handleError(error, 'Failed to fetch room types');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const body = await parseJson(request, createSchema);

    const property = await firstProperty(tenantId);
    if (!property) throw badRequest('No property found');

    const [roomType] = await db.insert(roomTypes).values({
      tenantId,
      propertyId: property.id,
      name: body.name,
      basePrice: body.basePrice.toFixed(2),
      maxOccupancy: body.maxOccupancy,
      amenities: body.amenities,
      description: body.description,
    }).returning();

    return NextResponse.json({ success: true, roomType });
  } catch (error) {
    return handleError(error, 'Failed to create room type');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const { id, basePrice: price, ...rest } = await parseJson(request, updateSchema);

    const updates: Partial<typeof roomTypes.$inferInsert> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) (updates as Record<string, unknown>)[key] = value;
    }
    if (price !== undefined) updates.basePrice = price.toFixed(2);
    if (Object.keys(updates).length === 0) return NextResponse.json({ success: true });

    const rows = await db.update(roomTypes)
      .set(updates)
      .where(and(eq(roomTypes.id, id), eq(roomTypes.tenantId, tenantId)))
      .returning({ id: roomTypes.id });
    if (!rows[0]) throw notFound('Room type');

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to update room type');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const id = assertUuid(new URL(request.url).searchParams.get('id'), 'Room type');

    const rows = await db.delete(roomTypes)
      .where(and(eq(roomTypes.id, id), eq(roomTypes.tenantId, tenantId)))
      .returning({ id: roomTypes.id });
    if (!rows[0]) throw notFound('Room type');

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete room type');
  }
}

export const dynamic = 'force-dynamic';
