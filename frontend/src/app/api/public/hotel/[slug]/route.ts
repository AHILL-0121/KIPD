import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gt, inArray, lt, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, roomTypes, rooms } from '@/db/schema';
import { handleError } from '@/lib/http';
import { resolveHotel } from '@/lib/public';
import { enforceRateLimit } from '@/lib/rate-limit';
import { zonedDateTimeToInstant } from '@/lib/tz';

export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Room types a guest can book at one hotel, optionally with whether each is free for given dates. */
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    await enforceRateLimit(request, 'pub-hotel', 90, 60);
    const { tenant, property } = await resolveHotel(params.slug);

    const types = await db.select().from(roomTypes).where(and(eq(roomTypes.tenantId, tenant.id), eq(roomTypes.propertyId, property.id)));
    // Rooms that can be sold at all (out-of-order and blocked rooms never count).
    const sellable = await db.select({ id: rooms.id, roomTypeId: rooms.roomTypeId }).from(rooms).where(and(
      eq(rooms.tenantId, tenant.id), eq(rooms.propertyId, property.id), notInArray(rooms.status, ['maintenance', 'blocked']),
    ));

    // With dates: which of those rooms already have an active booking in the way?
    const checkIn = request.nextUrl.searchParams.get('checkIn'), checkOut = request.nextUrl.searchParams.get('checkOut');
    let taken = new Set<string>();
    const withDates = !!checkIn && !!checkOut && DATE.test(checkIn) && DATE.test(checkOut) && checkOut > checkIn;
    if (withDates) {
      const from = zonedDateTimeToInstant(tenant.timezone, checkIn!, 14), to = zonedDateTimeToInstant(tenant.timezone, checkOut!, 11);
      const clashes = await db.select({ roomId: bookings.roomId }).from(bookings).where(and(
        eq(bookings.tenantId, tenant.id), inArray(bookings.status, ['pending', 'confirmed', 'checked_in']),
        lt(bookings.checkInDate, to), gt(bookings.checkOutDate, from),
      ));
      taken = new Set(clashes.map((c) => c.roomId));
    }

    const result = types
      .map((t) => {
        const roomsOfType = sellable.filter((r) => r.roomTypeId === t.id);
        return {
          id: t.id, name: t.name, description: t.description ?? '', basePrice: Number(t.basePrice),
          maxOccupancy: t.maxOccupancy, amenities: t.amenities ?? [],
          sellable: roomsOfType.length > 0,
          // A yes/no only. Exact stock levels are the hotel's business.
          available: withDates ? roomsOfType.some((r) => !taken.has(r.id)) : null,
        };
      })
      .filter((t) => t.sellable)
      .map(({ sellable: _sellable, ...rest }) => rest);

    return NextResponse.json({ hotel: { name: property.name || tenant.name, timezone: tenant.timezone }, roomTypes: result });
  } catch (error) {
    return handleError(error, 'Could not load the hotel');
  }
}
