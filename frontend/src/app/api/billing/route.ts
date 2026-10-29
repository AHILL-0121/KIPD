import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import Stripe from 'stripe';
import { z } from 'zod';
import { db } from '@/db';
import { bills, payments } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, badRequest, handleError, parseJson } from '@/lib/http';
import { ownedBill, ownedBooking } from '@/lib/tenant-scope';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, 'Card payments are not configured');
  return new Stripe(key, { apiVersion: '2023-10-16' });
}

const createSchema = z.object({
  bookingId: z.string().uuid(),
  items: z.array(z.object({
    amount: z.coerce.number().min(0).max(10_000_000),
    quantity: z.number().int().min(1).max(1000),
  })).min(1).max(200),
});

const paySchema = z.object({
  billId: z.string().uuid(),
  paymentMethod: z.enum(['cash', 'upi', 'card']).optional().default('cash'),
});

export async function GET() {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);

    // Scoped in SQL: only bills whose guest belongs to this tenant ever leave the database.
    const tenantBills = await db.query.bills.findMany({
      where: (b, { and }) => and(eq(b.tenantId, tenantId), inArray(b.status, ['open', 'partial', 'paid'])),
      with: { guest: true, booking: true },
      orderBy: (b, { desc }) => [desc(b.createdAt)],
    });

    return NextResponse.json(tenantBills.map((bill) => ({
      id: bill.id,
      guestName: bill.guest?.name || 'Walk-in Guest',
      totalAmount: Number(bill.totalAmount),
      paidAmount: Number(bill.paidAmount) || 0,
      status: bill.status,
      createdAt: bill.createdAt,
      receipt: bill.itemsBreakdown || null,
      items: [],
    })));
  } catch (error) {
    return handleError(error, 'Failed to fetch bills');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    const { bookingId, items } = await parseJson(request, createSchema);

    // The booking must be in one of this tenant's properties.
    const booking = await ownedBooking(tenantId, bookingId);

    const paise = items.reduce((sum, i) => sum + Math.round(i.amount * 100) * i.quantity, 0);
    const [bill] = await db.insert(bills).values({
      tenantId,
      guestId: booking.guestId,
      bookingId: booking.id,
      totalAmount: (paise / 100).toFixed(2),
      status: 'open',
    }).returning();

    return NextResponse.json({ success: true, bill });
  } catch (error) {
    return handleError(error, 'Failed to create bill');
  }
}

// Close a bill and record the payment.
export async function PATCH(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    const { billId, paymentMethod } = await parseJson(request, paySchema);

    const bill = await ownedBill(tenantId, billId);
    if (bill.status === 'paid') throw new HttpError(409, 'This bill is already paid');

    // Counter payments: cash or UPI taken in person.
    if (paymentMethod === 'cash' || paymentMethod === 'upi') {
      const [[updated]] = await db.batch([
        db.update(bills)
          .set({ status: 'paid', paidAmount: bill.totalAmount, settledAt: new Date() })
          .where(and(eq(bills.id, bill.id), eq(bills.tenantId, tenantId)))
          .returning(),
        db.insert(payments).values({ tenantId, billId: bill.id, amount: bill.totalAmount, method: paymentMethod }),
      ]);
      return NextResponse.json({ success: true, bill: updated });
    }

    // Card via Stripe. Note: currency is still 'usd' (checklist section 7: move to INR or an Indian PSP).
    const stripe = stripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(Number(bill.totalAmount) * 100),
      currency: 'usd',
      metadata: { billId: bill.id, tenantId },
    });
    await db.insert(payments).values({
      tenantId,
      billId: bill.id,
      amount: bill.totalAmount,
      method: 'stripe',
      stripePaymentIntentId: intent.id,
    });
    if (!intent.client_secret) throw badRequest('Could not start the card payment');
    return NextResponse.json({ success: true, clientSecret: intent.client_secret });
  } catch (error) {
    return handleError(error, 'Failed to process payment');
  }
}
