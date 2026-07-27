import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings, rooms } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireTenantContext } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireTenantContext();
    const { id } = params;
    const body = await request.json();
    const { action } = body;

    // Get the booking first to find the room
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, id),
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (action === 'check-in') {
      await db.update(bookings)
        .set({ status: 'checked_in' })
        .where(eq(bookings.id, id));
      await db.update(rooms)
        .set({ status: 'occupied' })
        .where(eq(rooms.id, booking.roomId));
    } else if (action === 'check-out') {
      await db.update(bookings)
        .set({ status: 'checked_out' })
        .where(eq(bookings.id, id));
      await db.update(rooms)
        .set({ status: 'cleaning' })
        .where(eq(rooms.id, booking.roomId));
    } else if (action === 'cancel') {
      await db.update(bookings)
        .set({ status: 'cancelled' })
        .where(eq(bookings.id, id));
      await db.update(rooms)
        .set({ status: 'available' })
        .where(eq(rooms.id, booking.roomId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update booking error:', error);
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
  }
}
