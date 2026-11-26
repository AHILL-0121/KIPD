import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, properties, tenants } from '@/db/schema';
import { assertUuid, handleError, notFound } from '@/lib/http';
import { buildIcalCalendar, verifyIcalToken } from '@/lib/ical';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Public signed iCal feed for external channel managers (Booking.com, Airbnb, Vrbo).
 * Protected by HMAC token (`?token=...`) bound to tenantId + propertyId.
 * Never exposes guest PII (email/phone) — exports room availability blocks only.
 */
export async function GET(request: NextRequest, { params }: { params: { propertyId: string } }) {
  try {
    await enforceRateLimit(request, 'pub-ical', 60, 60);
    const propertyId = assertUuid(params.propertyId, 'Property');
    const token = request.nextUrl.searchParams.get('token');

    const [prop] = await db
      .select({ id: properties.id, name: properties.name, tenantId: properties.tenantId })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    if (!prop) throw notFound('Property');

    const [tenant] = await db
      .select({ status: tenants.status, deletedAt: tenants.deletedAt })
      .from(tenants)
      .where(and(eq(tenants.id, prop.tenantId), isNull(tenants.deletedAt)))
      .limit(1);

    if (!tenant || tenant.status !== 'active') throw notFound('Property');
    if (!verifyIcalToken(prop.tenantId, prop.id, token)) {
      return NextResponse.json({ error: 'Invalid or missing sync token' }, { status: 403 });
    }

    const activeBookings = await db.query.bookings.findMany({
      where: and(
        eq(bookings.tenantId, prop.tenantId),
        eq(bookings.propertyId, prop.id),
        inArray(bookings.status, ['pending', 'confirmed', 'checked_in']),
      ),
      with: { room: true },
    });

    const ics = buildIcalCalendar(
      `${prop.name} — Availability`,
      activeBookings.map((b) => ({
        uid: `${b.id}@kipd.app`,
        start: new Date(b.checkInDate),
        end: new Date(b.checkOutDate),
        summary: `Room ${b.room?.roomNumber ?? 'Reserved'} — Reserved`,
        status: b.status,
        created: new Date(b.createdAt),
      })),
    );

    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    return handleError(error, 'Could not load iCal feed');
  }
}
