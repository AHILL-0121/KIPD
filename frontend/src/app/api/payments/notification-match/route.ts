import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, paymentEvents, properties } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { handleError, parseJson } from '@/lib/http';

/**
 * A UPI notification was seen on a staff device. Record it and suggest a matching open bill.
 *
 * Security notes:
 * - Requires a signed-in staff session. Tenant comes from the session, never from the request body.
 * - Only matches bills belonging to that tenant.
 * - Never marks anything paid: it only suggests a match. A person confirms at the counter.
 *   (Device-registered, signed requests are still to do: checklist section 8.)
 */
const ALLOWED_APPS = [
  'com.google.android.apps.nbu.paisa.user', // GPay
  'com.phonepe.app',                        // PhonePe
  'net.one97.paytm',                        // Paytm
];

const schema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
  reference: z.string().regex(/^[A-Za-z0-9]{6,40}$/).nullish(),
  packageName: z.string().refine((p) => ALLOWED_APPS.includes(p), 'Unsupported payment app'),
  deviceId: z.string().max(64).nullish(),
  propertyId: z.string().uuid().nullish(),
  rawText: z.string().max(500).nullish(),
  timestamp: z.number().int().nullish(),
});

/** Keep the last 4 digits of any long number (phone, account) and mask the rest. */
const mask = (text: string) => text.replace(/\d{8,}/g, (m) => '*'.repeat(m.length - 4) + m.slice(-4));

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.billing);
    const body = await parseJson(request, schema);

    // If a property was named, it must be this tenant's.
    let propertyId: string | null = null;
    if (body.propertyId) {
      const [owned] = await db.select({ id: properties.id }).from(properties)
        .where(and(eq(properties.id, body.propertyId), eq(properties.tenantId, tenantId))).limit(1);
      propertyId = owned?.id ?? null;
    }

    // Same UPI reference seen twice for this tenant = duplicate notification.
    if (body.reference) {
      const dup = await db.select({ id: paymentEvents.id }).from(paymentEvents)
        .where(and(eq(paymentEvents.tenantId, tenantId), eq(paymentEvents.parsedReference, body.reference))).limit(1);
      if (dup[0]) return NextResponse.json({ success: true, duplicate: true, status: 'duplicate' });
    }

    // Open bills for this tenant with exactly this total.
    const candidates = await db.select({ id: bills.id }).from(bills).where(and(
      eq(bills.tenantId, tenantId),
      eq(bills.status, 'open'),
      eq(bills.totalAmount, body.amount.toFixed(2)),
    )).limit(2);

    const matchedBillId = candidates.length === 1 ? candidates[0].id : null;
    const status = candidates.length === 1 ? 'pending_confirmation' : candidates.length > 1 ? 'ambiguous' : 'unmatched';

    // The unique index on (tenant, reference) decides duplicates even if two phones report the same
    // payment at the same instant; the earlier read above only saves work in the common case.
    const [event] = await db.insert(paymentEvents).values({
      tenantId,
      propertyId,
      source: 'notification',
      sourceApp: body.packageName,
      rawPayload: JSON.stringify({ text: body.rawText ? mask(body.rawText) : null, timestamp: body.timestamp ?? null }),
      parsedAmount: body.amount.toFixed(2),
      parsedReference: body.reference ?? null,
      deviceId: body.deviceId ?? null,
      matchedBillId,
      matchConfidence: matchedBillId ? 'probable' : 'unmatched',
    }).onConflictDoNothing().returning({ id: paymentEvents.id });

    if (!event) return NextResponse.json({ success: true, duplicate: true, status: 'duplicate' });
    return NextResponse.json({ success: true, status, matchedBillId, eventId: event.id });
  } catch (error) {
    return handleError(error, 'Failed to record payment notification');
  }
}
