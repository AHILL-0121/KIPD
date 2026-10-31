import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, bookings, rooms } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, handleError, parseJson } from '@/lib/http';
import { ownedBooking } from '@/lib/tenant-scope';
import { stayBillValues } from '@/lib/stay-bill';

const schema = z.object({ action: z.enum(['confirm', 'check-in', 'check-out', 'cancel']) });

// `room: null` means the room's status is left alone (confirming a future booking must not mark the room occupied).
const TRANSITIONS = {
  confirm: { booking: 'confirmed', room: null },
  'check-in': { booking: 'checked_in', room: 'occupied' },
  'check-out': { booking: 'checked_out', room: 'cleaning' },
  cancel: { booking: 'cancelled', room: 'available' },
} as const;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    const { action } = await parseJson(request, schema);

    // 404 if the booking isn't in this tenant's properties.
    const booking = await ownedBooking(tenantId, params.id);
    const next = TRANSITIONS[action];

    if (action === 'confirm' && booking.status !== 'pending') throw new HttpError(409, 'Only a pending booking can be confirmed.');

    const writes: unknown[] = [
      db.update(bookings).set({ status: next.booking }).where(and(eq(bookings.id, booking.id), eq(bookings.tenantId, tenantId)))
    ];
    if (next.room) {
      writes.push(db.update(rooms).set({ status: next.room }).where(and(eq(rooms.id, booking.roomId), eq(rooms.tenantId, tenantId))));
    }

    // Confirming (or checking in a booking that was never confirmed) opens the stay's bill. Doing it twice is harmless:
    // a booking can only have one live stay bill.
    if (action === 'confirm' || action === 'check-in') {
      const full = await db.query.bookings.findFirst({
        where: and(eq(bookings.id, booking.id), eq(bookings.tenantId, tenantId)),
        with: { room: { with: { roomType: true } } },
      });
      if (!full?.room) throw new HttpError(409, 'This booking\'s room no longer exists.');
      writes.push(db.insert(bills).values(stayBillValues({
        tenantId, bookingId: booking.id, guestId: booking.guestId, roomNumber: full.room.roomNumber,
        roomTypeName: full.room.roomType.name, checkIn: booking.checkInDate, checkOut: booking.checkOutDate, total: booking.totalAmount,
      })).onConflictDoNothing());
    }

    // Cancelling voids the bill. Money already paid on it is reported so the front desk can refund it by hand.
    let voids = false;
    if (action === 'cancel') {
      voids = true;
      writes.push(db.update(bills).set({ status: 'void' })
        .where(and(eq(bills.tenantId, tenantId), eq(bills.bookingId, booking.id), eq(bills.kind, 'stay'), inArray(bills.status, ['open', 'partial', 'paid'])))
        .returning({ paidAmount: bills.paidAmount }));
    }

    // db.batch wants a typed, non-empty tuple; the statements here are built conditionally.
    const results = (await db.batch(writes as never)) as unknown as { paidAmount: string | null }[][];
    const refundDue = voids ? Number(results[results.length - 1][0]?.paidAmount ?? 0) : 0;

    return NextResponse.json({ success: true, ...(refundDue > 0 ? { refundDue } : {}) });
  } catch (error) {
    return handleError(error, 'Failed to update booking');
  }
}
