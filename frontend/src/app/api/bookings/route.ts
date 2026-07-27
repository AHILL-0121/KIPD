import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings, guests, rooms, roomTypes, properties } from '@/db/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;
    const body = await request.json();
    const { roomId, guestName, guestEmail, guestPhone, checkInDate, checkOutDate, numGuests, specialRequests, source } = body;

    if (!roomId || !guestName || !guestEmail || !checkInDate || !checkOutDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get or create guest
    let guest = await db.query.guests.findFirst({
      where: and(eq(guests.email, guestEmail), eq(guests.tenantId, tenantId)),
    });

    if (!guest) {
      const [newGuest] = await db.insert(guests).values({
        email: guestEmail,
        name: guestName,
        phone: guestPhone || '',
        tenantId,
      }).returning();
      guest = newGuest;
    }

    // Get room details for pricing
    const room = await db.query.rooms.findFirst({
      where: eq(rooms.id, roomId),
      with: { roomType: true },
    });

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Calculate total
    const nights = Math.max(1, Math.ceil(
      (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24)
    ));
    const totalAmount = Number(room.roomType.basePrice) * nights;

    // Create booking
    const [booking] = await db.insert(bookings).values({
      propertyId: room.propertyId,
      roomId: room.id,
      guestId: guest.id,
      checkInDate: new Date(checkInDate),
      checkOutDate: new Date(checkOutDate),
      numGuests: numGuests || 1,
      status: 'confirmed',
      totalAmount: totalAmount.toString(),
      specialRequests: specialRequests || '',
      source: source || 'staff',
    }).returning();

    // Update room status to occupied
    await db.update(rooms)
      .set({ status: 'occupied' })
      .where(eq(rooms.id, room.id));

    return NextResponse.json({ success: true, booking });
  } catch (error) {
    console.error('Booking error:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}

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

    const allBookings = await db.query.bookings.findMany({
      where: inArray(bookings.propertyId, propertyIds),
      with: {
        guest: true,
        room: {
          with: {
            roomType: true,
          },
        },
      },
      orderBy: (bookings, { desc }) => [desc(bookings.createdAt)],
    });

    return NextResponse.json(allBookings);
  } catch (error) {
    console.error('Get bookings error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}
