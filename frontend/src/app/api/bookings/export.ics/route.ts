import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, properties } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildIcalCalendar, signIcalToken } from '@/lib/ical';
import { firstProperty, ownedPropertyOrDefault } from '@/lib/ical-helpers';

export const dynamic = 'force-dynamic';

/**
 * Staff iCal export & channel-manager feed URL generator.
 * - `?mode=feed-url`: returns the signed public iCal URL for Airbnb / Booking.com channel sync.
 * - Default: returns a downloadable `bookings.ics` RFC 5545 calendar file.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk, 'hotel');
    const propertyParam = request.nextUrl.searchParams.get('propertyId');
    const mode = request.nextUrl.searchParams.get('mode');

    const property = propertyParam
      ? await ownedPropertyOrDefault(tenantId, propertyParam)
      : await firstProperty(tenantId);

    if (mode === 'feed-url') {
      if (!property) {
        return NextResponse.json({ feedUrl: null, propertyName: null });
      }
      const token = signIcalToken(tenantId, property.id);
      const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
      return NextResponse.json({
        propertyId: property.id,
        propertyName: property.name,
        feedUrl: `${base}/api/public/ical/${property.id}?token=${encodeURIComponent(token)}`,
      });
    }

    const filters = [
      eq(bookings.tenantId, tenantId),
      inArray(bookings.status, ['pending', 'confirmed', 'checked_in']),
    ];
    if (propertyParam && property) {
      filters.push(eq(bookings.propertyId, property.id));
    }

    const rows = await db.query.bookings.findMany({
      where: and(...filters),
      with: { room: true, guest: true, property: true },
    });

    const calendarName = property?.name ? `${property.name} — Reservations` : 'Kipd Reservations';
    const ics = buildIcalCalendar(
      calendarName,
      rows.map((b) => ({
        uid: `${b.id}@kipd.app`,
        start: new Date(b.checkInDate),
        end: new Date(b.checkOutDate),
        summary: `Room ${b.room?.roomNumber ?? '?'} — ${b.guest?.name ?? 'Guest'}`,
        description: `Status: ${b.status} · Guests: ${b.numGuests} · Source: ${b.source ?? 'staff'}`,
        status: b.status,
        created: new Date(b.createdAt),
      })),
    );

    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bookings.ics"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleError(error, 'Failed to export iCal feed');
  }
}

export async function HEAD() {
  const count = await db.select({ id: properties.id }).from(properties).limit(1);
  return new NextResponse(null, { status: count ? 200 : 200 });
}
