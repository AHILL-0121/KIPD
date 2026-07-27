import { NextResponse } from 'next/server';
import { db } from '@/db';
import { bills, paymentEvents } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { amount, reference, packageName, timestamp, deviceId, propertyId, tenantId, rawText } = body;

        // 1. Log the incoming notification event unconditionally
        const [eventLog] = await db.insert(paymentEvents).values({
            source: 'notification',
            sourceApp: packageName,
            rawPayload: JSON.stringify({ rawText, timestamp }),
            parsedAmount: amount?.toString(),
            parsedReference: reference,
            deviceId: deviceId,
            propertyId: propertyId,
            tenantId: tenantId,
            matchConfidence: 'unmatched' // Default
        }).returning();

        if (!amount || !propertyId) {
            return NextResponse.json({ success: false, message: 'Missing amount or propertyId' }, { status: 400 });
        }

        // 2. Search for open bills for this property matching the amount
        // In a real scenario, you'd match within a specific time window and handle concurrency.
        const matchingBills = await db.select().from(bills).where(
            and(
                eq(bills.paymentStatus, 'unpaid'),
                eq(bills.totalAmount, amount.toString())
            )
        ).limit(1);

        if (matchingBills.length > 0) {
            const match = matchingBills[0];

            // 3. Update the Bill to 'pending_confirmation'
            await db.update(bills)
                .set({ paymentStatus: 'pending_confirmation', paymentMethod: 'upi_notification' })
                .where(eq(bills.id, match.id));

            // 4. Update the event log to mark it matched
            await db.update(paymentEvents)
                .set({ matchedBillId: match.id, matchConfidence: 'probable' })
                .where(eq(paymentEvents.id, eventLog.id));

            return NextResponse.json({ success: true, matchedBillId: match.id, status: 'pending_confirmation' });
        }

        return NextResponse.json({ success: true, matchedBillId: null, message: 'No matching bill found for this amount.' });

    } catch (error: any) {
        console.error('Payment Match Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
