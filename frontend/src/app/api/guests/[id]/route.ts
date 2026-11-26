import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, bookings, guests } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { assertUuid, handleError, notFound, parseJson } from '@/lib/http';
import { writeTenantAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const prefValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);
const patchSchema = z.object({
  preferences: z.record(z.string().trim().min(1).max(60), prefValue).optional(),
  notes: z.string().max(2000).nullable().optional(),
}).refine((d) => d.preferences !== undefined || d.notes !== undefined, {
  message: 'Provide preferences or notes to update',
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk, 'hotel');
    const guestId = assertUuid(params.id, 'Guest');

    const [guest] = await db
      .select()
      .from(guests)
      .where(and(eq(guests.id, guestId), eq(guests.tenantId, tenantId)))
      .limit(1);

    if (!guest) throw notFound('Guest');

    const [guestBookings, guestBills] = await Promise.all([
      db.query.bookings.findMany({
        where: and(eq(bookings.guestId, guestId), eq(bookings.tenantId, tenantId)),
        with: { room: { with: { roomType: true } }, property: true },
        orderBy: [desc(bookings.checkInDate)],
        limit: 30,
      }),
      db
        .select({
          id: bills.id,
          kind: bills.kind,
          status: bills.status,
          totalAmount: bills.totalAmount,
          paidAmount: bills.paidAmount,
          createdAt: bills.createdAt,
        })
        .from(bills)
        .where(and(eq(bills.guestId, guestId), eq(bills.tenantId, tenantId))),
    ]);

    const liveBills = guestBills.filter((b) => b.status !== 'void');
    const totalBilled = liveBills.reduce((s, b) => s + Number(b.totalAmount), 0);
    const totalPaid = liveBills.reduce((s, b) => s + Number(b.paidAmount ?? 0), 0);
    const completedStays = guestBookings.filter((b) => b.status === 'checked_out').length;

    return NextResponse.json({
      guest: {
        id: guest.id,
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
        preferences: (guest.preferences as Record<string, unknown> | null) ?? {},
        notes: guest.notes ?? '',
        createdAt: guest.createdAt,
      },
      bookings: guestBookings.map((b) => ({
        id: b.id,
        checkInDate: b.checkInDate,
        checkOutDate: b.checkOutDate,
        numGuests: b.numGuests,
        status: b.status,
        totalAmount: Number(b.totalAmount),
        source: b.source,
        specialRequests: b.specialRequests,
        propertyName: b.property?.name ?? null,
        roomNumber: b.room?.roomNumber ?? null,
        roomTypeName: b.room?.roomType?.name ?? null,
      })),
      stats: {
        totalBookings: guestBookings.length,
        completedStays,
        totalBilled: Math.round(totalBilled * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
      },
    });
  } catch (error) {
    return handleError(error, 'Failed to fetch guest profile');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId, userId, userName } = await requireTenant(ROLES.frontDesk, 'hotel');
    const guestId = assertUuid(params.id, 'Guest');
    const body = await parseJson(request, patchSchema);

    const updates: Partial<typeof guests.$inferInsert> = {};
    if (body.preferences !== undefined) updates.preferences = body.preferences;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [updated] = await db
      .update(guests)
      .set(updates)
      .where(and(eq(guests.id, guestId), eq(guests.tenantId, tenantId)))
      .returning();

    if (!updated) throw notFound('Guest');

    void writeTenantAudit({
      tenantId,
      actorUserId: userId,
      actorName: userName,
      action: 'guest.update_profile',
      targetType: 'guest',
      targetId: guestId,
    });

    return NextResponse.json({
      success: true,
      guest: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        preferences: (updated.preferences as Record<string, unknown> | null) ?? {},
        notes: updated.notes ?? '',
      },
    });
  } catch (error) {
    return handleError(error, 'Failed to update guest preferences');
  }
}
