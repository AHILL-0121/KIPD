import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rooms, properties, roomTypes } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    // Get all properties for this tenant
    const tenantProperties = await db.query.properties.findMany({
      where: eq(properties.tenantId, tenantId),
    });

    if (tenantProperties.length === 0) {
      return NextResponse.json([]);
    }

    const propertyIds = tenantProperties.map(p => p.id);

    const allRooms = await db.query.rooms.findMany({
      where: inArray(rooms.propertyId, propertyIds),
      with: {
        roomType: true,
      },
      orderBy: (rooms, { asc }) => [asc(rooms.roomNumber)],
    });

    return NextResponse.json(allRooms);
  } catch (error) {
    console.error('Get rooms error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rooms' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;
    const body = await request.json();
    const { roomNumber, roomTypeId, floor, status } = body;

    if (!roomNumber || !roomTypeId) {
      return NextResponse.json({ error: 'Room number and room type are required' }, { status: 400 });
    }

    // Get tenant's first property
    const property = await db.query.properties.findFirst({
      where: eq(properties.tenantId, tenantId),
    });

    if (!property) {
      return NextResponse.json({ error: 'No property found' }, { status: 400 });
    }

    const [room] = await db.insert(rooms).values({
      propertyId: property.id,
      roomTypeId,
      roomNumber,
      floor: floor || 1,
      status: status || 'available',
    }).returning();

    return NextResponse.json({ success: true, room });
  } catch (error) {
    console.error('Create room error:', error);
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireTenantContext();
    const body = await request.json();
    const { roomId, status, roomNumber, roomTypeId, floor } = body;

    if (!roomId) {
      return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
    }

    await db.update(rooms)
      .set({ 
        ...(status && { status }),
        ...(roomNumber && { roomNumber }),
        ...(roomTypeId && { roomTypeId }),
        ...(floor !== undefined && { floor }),
      })
      .where(eq(rooms.id, roomId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update room error:', error);
    return NextResponse.json(
      { error: 'Failed to update room' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireTenantContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
    }

    await db.delete(rooms).where(eq(rooms.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete room error:', error);
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 });
  }
}
