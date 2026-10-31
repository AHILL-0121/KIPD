import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bookings, guests, roomTypes, rooms } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, handleError, parseJson } from '@/lib/http';
import { ownedRoom } from '@/lib/tenant-scope';
import { placeholderEmail } from '@/lib/guest-email';

const createSchema = z.object({
  roomId: z.string().uuid(),
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(200)]).optional(), // optional: see lib/guest-email
  guestPhone: z.string().trim().max(20).optional().default(''),
  checkInDate: z.coerce.date(),
  checkOutDate: z.coerce.date(),
  numGuests: z.coerce.number().int().min(1).max(20).optional().default(1),
  specialRequests: z.string().max(500).optional().default(''),
  source: z.enum(['online', 'walk_in', 'staff']).optional().default('staff'),
}).refine((b) => b.checkOutDate > b.checkInDate, { message: 'Check-out must be after check-in', path: ['checkOutDate'] });

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    const body = await parseJson(request, createSchema);

    // The room must belong to this tenant.
    const room = await ownedRoom(tenantId, body.roomId);

    // No double-booking: reject if an active booking overlaps these dates.
    const clash = await db.select({ id: bookings.id }).from(bookings).where(and(
      eq(bookings.tenantId, tenantId),
      eq(bookings.roomId, room.id),
      inArray(bookings.status, ['pending', 'confirmed', 'checked_in']),
      lt(bookings.checkInDate, body.checkOutDate),
      gt(bookings.checkOutDate, body.checkInDate),
    )).limit(1);
    if (clash[0]) throw new HttpError(409, 'This room is already booked for those dates.');

    const [roomType] = await db.select().from(roomTypes).where(and(eq(roomTypes.id, room.roomTypeId), eq(roomTypes.tenantId, tenantId))).limit(1);
    const nights = Math.max(1, Math.ceil((body.checkOutDate.getTime() - body.checkInDate.getTime()) / 86_400_000));
    const totalAmount = (Number(roomType.basePrice) * nights).toFixed(2);

    // Find or create the guest. The unique index on (tenant, lower(email)) makes this safe even if
    // two requests for the same new guest arrive together: the loser's insert is ignored, then it re-reads.
    const guestEmail = body.guestEmail || placeholderEmail();
    await db.insert(guests)
      .values({ email: guestEmail, name: body.guestName, phone: body.guestPhone, tenantId })
      .onConflictDoNothing();
    const guest = await db.query.guests.findFirst({
      where: and(eq(guests.tenantId, tenantId), eq(sql`lower(${guests.email})`, guestEmail)),
    });
    if (!guest) throw new HttpError(500, 'Could not save the guest');

    const bookingId = crypto.randomUUID();
    const [[booking]] = await db.batch([
      db.insert(bookings).values({
        id: bookingId,
        tenantId,
        propertyId: room.propertyId,
        roomId: room.id,
        guestId: guest.id,
        checkInDate: body.checkInDate,
        checkOutDate: body.checkOutDate,
        numGuests: body.numGuests,
        status: 'confirmed',
        totalAmount,
        specialRequests: body.specialRequests,
        source: body.source,
      }).returning(),
      db.update(rooms).set({ status: 'occupied' }).where(and(eq(rooms.id, room.id), eq(rooms.tenantId, tenantId))),
    ]);

    return NextResponse.json({ success: true, booking });
  } catch (error) {
    return handleError(error, 'Failed to create booking');
  }
}

export async function GET() {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    const all = await db.query.bookings.findMany({
      where: eq(bookings.tenantId, tenantId),
      with: { guest: true, room: { with: { roomType: true } } },
      orderBy: (b, { desc }) => [desc(b.createdAt)],
    });
    return NextResponse.json(all);
  } catch (error) {
    return handleError(error, 'Failed to fetch bookings');
  }
}

export const dynamic = 'force-dynamic';
