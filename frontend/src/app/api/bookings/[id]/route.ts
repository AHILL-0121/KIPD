import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bookings, rooms } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, handleError, parseJson } from '@/lib/http';
import { ownedBooking } from '@/lib/tenant-scope';

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

    const updateBooking = db.update(bookings).set({ status: next.booking }).where(and(eq(bookings.id, booking.id), eq(bookings.tenantId, tenantId)));
    if (next.room) {
      await db.batch([updateBooking, db.update(rooms).set({ status: next.room }).where(and(eq(rooms.id, booking.roomId), eq(rooms.tenantId, tenantId)))]);
    } else {
      await updateBooking;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to update booking');
  }
}
