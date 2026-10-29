import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, gt, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bookings, guests, roomTypes, rooms } from '@/db/schema';
import { HttpError, badRequest, handleError, notFound, parseJson } from '@/lib/http';
import { SLUG, resolveHotel } from '@/lib/public';
import { enforceRateLimit } from '@/lib/rate-limit';
import { todayInZone, zonedDateTimeToInstant } from '@/lib/tz';

/** Hotel-local times: guests arrive from 14:00 and leave by 11:00. */
const CHECK_IN_HOUR = 14, CHECK_OUT_HOUR = 11;
const MAX_NIGHTS = 30, MAX_DAYS_AHEAD = 365;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD');

const schema = z.object({
  slug: z.string().regex(SLUG).max(100),
  roomTypeId: z.string().uuid(),
  checkIn: DATE,
  checkOut: DATE,
  guests: z.number().int().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{6,20}$/, 'Enter a valid phone number').optional().or(z.literal('')),
  requests: z.string().trim().max(500).optional(),
  website: z.string().max(0).optional(), // honeypot
});

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const errCode = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;

/**
 * A guest asks to book a room. It is stored as PENDING: the hotel confirms it. Pending bookings still block
 * the room, so nobody else can take it while the hotel decides.
 */
export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(request, 'pub-booking-10m', 5, 600);
    await enforceRateLimit(request, 'pub-booking-day', 20, 86_400);

    const body = await parseJson(request, schema);
    const { tenant, property } = await resolveHotel(body.slug);

    const [roomType] = await db.select().from(roomTypes).where(and(
      eq(roomTypes.id, body.roomTypeId), eq(roomTypes.tenantId, tenant.id), eq(roomTypes.propertyId, property.id),
    )).limit(1);
    if (!roomType) throw notFound('Room type');

    // Dates are the hotel's calendar dates, not the guest's or the server's.
    const today = todayInZone(tenant.timezone);
    const nights = daysBetween(body.checkIn, body.checkOut);
    if (Number.isNaN(nights) || nights < 1) throw badRequest('Check-out must be after check-in.');
    if (body.checkIn < today) throw badRequest('Check-in cannot be in the past.');
    if (nights > MAX_NIGHTS) throw badRequest(`We take online bookings of up to ${MAX_NIGHTS} nights. Please contact the hotel for longer stays.`);
    if (daysBetween(today, body.checkIn) > MAX_DAYS_AHEAD) throw badRequest('That date is too far ahead to book online.');
    if (body.guests > roomType.maxOccupancy) throw badRequest(`This room sleeps up to ${roomType.maxOccupancy} guests.`);

    const checkInAt = zonedDateTimeToInstant(tenant.timezone, body.checkIn, CHECK_IN_HOUR);
    const checkOutAt = zonedDateTimeToInstant(tenant.timezone, body.checkOut, CHECK_OUT_HOUR);

    // Find or create the guest without overwriting what the hotel already knows about them.
    await db.insert(guests).values({ tenantId: tenant.id, email: body.email, name: body.name, phone: body.phone || null }).onConflictDoNothing();
    const guest = await db.query.guests.findFirst({ where: and(eq(guests.tenantId, tenant.id), eq(sql`lower(${guests.email})`, body.email)) });
    if (!guest) throw new HttpError(500, 'Could not save your details');

    // Candidate rooms: right type, sellable, not already booked for these dates.
    const busy = await db.select({ roomId: bookings.roomId }).from(bookings).where(and(
      eq(bookings.tenantId, tenant.id), inArray(bookings.status, ['pending', 'confirmed', 'checked_in']),
      lt(bookings.checkInDate, checkOutAt), gt(bookings.checkOutDate, checkInAt),
    ));
    const busyIds = new Set(busy.map((b) => b.roomId));
    const candidates = (await db.select({ id: rooms.id }).from(rooms).where(and(
      eq(rooms.tenantId, tenant.id), eq(rooms.roomTypeId, roomType.id), notInArray(rooms.status, ['maintenance', 'blocked']),
    )).orderBy(asc(rooms.roomNumber))).filter((r) => !busyIds.has(r.id));

    // Try each free room. If someone else grabs it first, the database's no-overlap rule rejects our insert
    // (error 23P01) and we simply move on to the next room.
    const total = (Number(roomType.basePrice) * nights).toFixed(2);
    for (const room of candidates) {
      const id = crypto.randomUUID();
      try {
        await db.insert(bookings).values({
          id, tenantId: tenant.id, propertyId: property.id, roomId: room.id, guestId: guest.id,
          checkInDate: checkInAt, checkOutDate: checkOutAt, numGuests: body.guests,
          status: 'pending', source: 'online', totalAmount: total, specialRequests: body.requests || null,
        });
        return NextResponse.json({
          success: true, reference: id.slice(0, 8).toUpperCase(), status: 'pending',
          roomType: roomType.name, checkIn: body.checkIn, checkOut: body.checkOut, nights, total: Number(total),
        }, { status: 201 });
      } catch (error) {
        if (errCode(error) === '23P01') continue;
        throw error;
      }
    }
    throw new HttpError(409, 'Sorry, there is no room of that type available for those dates. Please try other dates or another room type.');
  } catch (error) {
    return handleError(error, 'Could not send your booking request');
  }
}
