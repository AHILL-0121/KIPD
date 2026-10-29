import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bookings, rooms } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';
import { ownedBooking } from '@/lib/tenant-scope';

const schema = z.object({ action: z.enum(['check-in', 'check-out', 'cancel']) });

const TRANSITIONS = {
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

    await db.batch([
      db.update(bookings).set({ status: next.booking }).where(and(eq(bookings.id, booking.id), eq(bookings.tenantId, tenantId))),
      db.update(rooms).set({ status: next.room }).where(and(eq(rooms.id, booking.roomId), eq(rooms.tenantId, tenantId))),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, 'Failed to update booking');
  }
}
