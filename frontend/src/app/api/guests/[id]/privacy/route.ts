import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { bills, bookings, guests, orders } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { assertUuid, handleError, notFound } from '@/lib/http';
import { writeTenantAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * DPDP Act / GDPR Guest PII Export (GET) & Right-to-Erasure Anonymization (DELETE).
 * Anonymizing removes name, email, phone, and preferences while keeping guest UUID links
 * on historical financial records (bills, invoices, credit notes) intact for tax audits.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId, userId, userName } = await requireTenant(ROLES.manage);
    const guestId = assertUuid(params.id, 'Guest');

    const [guest] = await db
      .select()
      .from(guests)
      .where(and(eq(guests.id, guestId), eq(guests.tenantId, tenantId)))
      .limit(1);
    if (!guest) throw notFound('Guest');

    const [guestBookings, guestBills, guestOrders] = await Promise.all([
      db.select().from(bookings).where(and(eq(bookings.guestId, guestId), eq(bookings.tenantId, tenantId))),
      db.select().from(bills).where(and(eq(bills.guestId, guestId), eq(bills.tenantId, tenantId))),
      db.select().from(orders).where(and(eq(orders.guestId, guestId), eq(orders.tenantId, tenantId))),
    ]);

    void writeTenantAudit({
      tenantId,
      actorUserId: userId,
      actorName: userName,
      action: 'guest.pii_export',
      targetType: 'guest',
      targetId: guestId,
    });

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      guest: {
        id: guest.id,
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
        preferences: guest.preferences,
        createdAt: guest.createdAt,
      },
      bookings: guestBookings,
      bills: guestBills.map((b) => ({
        id: b.id,
        kind: b.kind,
        status: b.status,
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        invoiceNumber: b.invoiceNumber,
        createdAt: b.createdAt,
      })),
      orders: guestOrders,
    });
  } catch (error) {
    return handleError(error, 'Failed to export guest data');
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId, userId, userName } = await requireTenant(ROLES.manage);
    const guestId = assertUuid(params.id, 'Guest');

    const updated = await db
      .update(guests)
      .set({
        name: 'Deleted Guest',
        email: `deleted-${guestId}@anonymized.kipd.local`,
        phone: null,
        preferences: null,
      })
      .where(and(eq(guests.id, guestId), eq(guests.tenantId, tenantId)))
      .returning({ id: guests.id });

    if (!updated[0]) throw notFound('Guest');

    void writeTenantAudit({
      tenantId,
      actorUserId: userId,
      actorName: userName,
      action: 'guest.anonymize',
      targetType: 'guest',
      targetId: guestId,
    });

    return NextResponse.json({ success: true, anonymized: true });
  } catch (error) {
    return handleError(error, 'Failed to anonymize guest data');
  }
}
