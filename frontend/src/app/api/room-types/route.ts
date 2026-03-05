import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { roomTypes, properties } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    const tenantProperties = await db.query.properties.findMany({
      where: eq(properties.tenantId, tenantId),
    });

    if (tenantProperties.length === 0) {
      return NextResponse.json([]);
    }

    const propertyIds = tenantProperties.map(p => p.id);

    const allRoomTypes = await db.query.roomTypes.findMany({
      where: inArray(roomTypes.propertyId, propertyIds),
      orderBy: (roomTypes, { asc }) => [asc(roomTypes.name)],
    });

    return NextResponse.json(allRoomTypes);
  } catch (error) {
    console.error('Get room types error:', error);
    return NextResponse.json({ error: 'Failed to fetch room types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;
    const body = await request.json();
    const { name, basePrice, maxOccupancy, amenities, description } = body;

    if (!name || !basePrice) {
      return NextResponse.json({ error: 'Name and base price are required' }, { status: 400 });
    }

    // Get tenant's first property
    const property = await db.query.properties.findFirst({
      where: eq(properties.tenantId, tenantId),
    });

    if (!property) {
      return NextResponse.json({ error: 'No property found' }, { status: 400 });
    }

    const [roomType] = await db.insert(roomTypes).values({
      propertyId: property.id,
      name,
      basePrice: basePrice.toString(),
      maxOccupancy: maxOccupancy || 2,
      amenities: amenities || [],
      description: description || '',
    }).returning();

    return NextResponse.json({ success: true, roomType });
  } catch (error) {
    console.error('Create room type error:', error);
    return NextResponse.json({ error: 'Failed to create room type' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireTenantContext();
    const body = await request.json();
    const { id, name, basePrice, maxOccupancy, amenities, description } = body;

    if (!id) {
      return NextResponse.json({ error: 'Room type ID required' }, { status: 400 });
    }

    await db.update(roomTypes)
      .set({
        ...(name && { name }),
        ...(basePrice && { basePrice: basePrice.toString() }),
        ...(maxOccupancy && { maxOccupancy }),
        ...(amenities && { amenities }),
        ...(description !== undefined && { description }),
      })
      .where(eq(roomTypes.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update room type error:', error);
    return NextResponse.json({ error: 'Failed to update room type' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireTenantContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Room type ID required' }, { status: 400 });
    }

    await db.delete(roomTypes).where(eq(roomTypes.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete room type error:', error);
    return NextResponse.json({ error: 'Failed to delete room type' }, { status: 500 });
  }
}
