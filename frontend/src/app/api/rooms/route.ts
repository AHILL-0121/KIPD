import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { rooms } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { assertUuid, handleError, notFound, parseJson } from '@/lib/http';
import { ownedRoomType } from '@/lib/tenant-scope';

const status = z.enum(['available', 'occupied', 'cleaning', 'maintenance', 'blocked']);

const createSchema = z.object({
  roomNumber: z.string().trim().min(1).max(20),
  roomTypeId: z.string().uuid(),
  floor: z.coerce.number().int().min(0).max(200).optional().default(1),
  status: status.optional().default('available'),
});

const patchSchema = z.object({
  roomId: z.string().uuid(),
  status: status.optional(),
  roomNumber: z.string().trim().min(1).max(20).optional(),
  roomTypeId: z.string().uuid().optional(),
  floor: z.coerce.number().int().min(0).max(200).optional(),
});

export async function GET() {
  try {
    const { tenantId } = await requireTenant();
    const allRooms = await db.query.rooms.findMany({
      where: eq(rooms.tenantId, tenantId),
      with: { roomType: true },
      orderBy: (r, { asc }) => [asc(r.roomNumber)],
    });
    return NextResponse.json(allRooms);
  } catch (error) {
    return handleError(error, 'Failed to fetch rooms');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const body = await parseJson(request, createSchema);

    // The room belongs to the same property as its room type (and the type must be ours).
    const roomType = await ownedRoomType(tenantId, body.roomTypeId);

    const [room] = await db.insert(rooms).values({
      tenantId,
      propertyId: roomType.propertyId,
      roomTypeId: roomType.id,
      roomNumber: body.roomNumber,
      floor: body.floor,
      status: body.status,
    }).returning();

    return NextResponse.json({ success: true, room });
  } catch (error) {
    return handleError(error, 'Failed to create room');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Front desk and housekeeping flows change room status; structural edits are managers' only.
    const body = await parseJson(request, patchSchema);
    const structural = body.roomNumber !== undefined || body.roomTypeId !== undefined || body.floor !== undefined;
    const { tenantId } = await requireTenant(structural ? ROLES.manage : ROLES.frontDesk);

    const updates: Partial<typeof rooms.$inferInsert> = {};
    if (body.status) updates.status = body.status;
    if (body.roomNumber) updates.roomNumber = body.roomNumber;
    if (body.floor !== undefined) updates.floor = body.floor;
    if (body.roomTypeId) updates.roomTypeId = (await ownedRoomType(tenantId, body.roomTypeId)).id;
    if (Object.keys(updates).length === 0) return NextResponse.json({ success: true });

    const result = await db.update(rooms)
      .set(updates)
      .where(and(eq(rooms.id, body.roomId), eq(rooms.tenantId, tenantId)))
      .returning({ id: rooms.id });
    if (!result[0]) throw notFound('Room');

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to update room');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.manage);
    const id = assertUuid(new URL(request.url).searchParams.get('id'), 'Room');

    const rows = await db.delete(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.tenantId, tenantId)))
      .returning({ id: rooms.id });
    if (!rows[0]) throw notFound('Room');

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to delete room');
  }
}

export const dynamic = 'force-dynamic';
