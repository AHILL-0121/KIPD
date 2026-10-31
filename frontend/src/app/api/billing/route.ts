import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { z } from 'zod';
import { db } from '@/db';
import { bills, payments } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, badRequest, handleError, parseJson } from '@/lib/http';
import { ownedBill, ownedBooking } from '@/lib/tenant-scope';
import { nightsBetween } from '@/lib/stay-bill';

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

/** Money in rupees with at most two decimals, as whole paise (so 0.1 + 0.2 style rounding can never leak in). */
const paise = z.coerce.number().positive().max(10_000_000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most two decimal places');

// 'stripe' starts a gateway payment (kept until Razorpay replaces it). Every other method is money a person received
// and is recording here: cash, UPI, a card machine, or a bank transfer.
const paySchema = z.object({
  billId: z.string().uuid(),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'stripe']).optional().default('cash'),
  /** Defaults to everything still owed. Less than that is a part payment (a deposit, for example). */
  amount: paise.optional(),
  reference: z.string().trim().max(60).optional(),
  note: z.string().trim().max(200).optional(),
});

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    const kind = request.nextUrl.searchParams.get('kind');
    if (kind && kind !== 'stay' && kind !== 'restaurant') throw badRequest('kind must be stay or restaurant');

    // Scoped in SQL: only bills of this tenant ever leave the database. Voided bills (cancelled bookings) are not listed.
    const tenantBills = await db.query.bills.findMany({
      where: (b) => and(eq(b.tenantId, tenantId), inArray(b.status, ['open', 'partial', 'paid']), kind ? eq(b.kind, kind) : undefined),
      with: { guest: true, booking: { with: { room: true } }, payments: true },
      orderBy: (b, { desc }) => [desc(b.createdAt)],
    });

    return NextResponse.json(tenantBills.map((bill) => ({
      id: bill.id,
      kind: bill.kind,
      guestName: bill.guest?.name || 'Walk-in Guest',
      totalAmount: Number(bill.totalAmount),
      paidAmount: Number(bill.paidAmount) || 0,
      status: bill.status,
      createdAt: bill.createdAt,
      settledAt: bill.settledAt,
      receipt: bill.itemsBreakdown || null,
      stay: bill.booking ? {
        roomNumber: bill.booking.room?.roomNumber ?? null,
        checkIn: bill.booking.checkInDate,
        checkOut: bill.booking.checkOutDate,
        nights: nightsBetween(bill.booking.checkInDate, bill.booking.checkOutDate),
        bookingStatus: bill.booking.status,
      } : null,
      payments: bill.payments
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({ id: p.id, amount: Number(p.amount), method: p.method, reference: p.reference, receivedBy: p.receivedBy, note: p.note, createdAt: p.createdAt })),
      items: [],
    })));
  } catch (error) {
    return handleError(error, 'Failed to fetch bills');
  }
}

// Raises a stay bill by hand. Bills for stays normally open on their own when a booking is confirmed.
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    const { bookingId, items } = await parseJson(request, createSchema);

    // The booking must be in one of this tenant's properties.
    const booking = await ownedBooking(tenantId, bookingId);

    const total = items.reduce((sum, i) => sum + Math.round(i.amount * 100) * i.quantity, 0);
    const [bill] = await db.insert(bills).values({
      tenantId,
      guestId: booking.guestId,
      bookingId: booking.id,
      kind: 'stay',
      totalAmount: (total / 100).toFixed(2),
      status: 'open',
    }).onConflictDoNothing().returning();
    if (!bill) throw new HttpError(409, 'This booking already has a bill.');

    return NextResponse.json({ success: true, bill });
  } catch (error) {
    return handleError(error, 'Failed to create bill');
  }
}

// Record a payment against a bill. A part payment leaves the bill open as "partial"; paying the last of it closes it.
export async function PATCH(request: NextRequest) {
  try {
    const { tenantId, userId, userName } = await requireTenant(ROLES.frontDesk);
    const { billId, paymentMethod, amount, reference, note } = await parseJson(request, paySchema);

    const bill = await ownedBill(tenantId, billId);
    if (bill.status === 'paid') throw new HttpError(409, 'This bill is already paid');
    if (bill.status === 'void') throw new HttpError(409, 'This bill was cancelled with its booking');

    // Card via Stripe. Note: currency is still 'usd' (checklist 7a: Razorpay replaces this).
    if (paymentMethod === 'stripe') {
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
    }

    // Money someone received. One statement adds the payment AND moves the bill (paid amount, status, settled time),
    // and only when the amount still fits within what is owed, so two people recording at once cannot overpay a bill.
    const owed = Math.round((Number(bill.totalAmount) - Number(bill.paidAmount ?? 0)) * 100);
    const cents = amount === undefined ? owed : Math.round(amount * 100);
    const pay = (cents / 100).toFixed(2);
    const result = await db.execute(sql`
      with moved as (
        update bills set
          paid_amount = coalesce(paid_amount, 0) + ${pay}::numeric,
          status = case when coalesce(paid_amount, 0) + ${pay}::numeric >= total_amount then 'paid' else 'partial' end,
          settled_at = case when coalesce(paid_amount, 0) + ${pay}::numeric >= total_amount then now() else settled_at end
        where id = ${bill.id} and tenant_id = ${tenantId}
          and status in ('open', 'partial')
          and coalesce(paid_amount, 0) + ${pay}::numeric <= total_amount
        returning id, tenant_id, total_amount, paid_amount, status
      ), saved as (
        insert into payments (tenant_id, bill_id, amount, method, reference, received_by, received_by_user_id, note)
        select tenant_id, id, ${pay}::numeric, ${paymentMethod}, ${reference || null}, ${userName}, ${userId}, ${note || null} from moved
        returning id
      )
      select moved.id as bill_id, moved.total_amount, moved.paid_amount, moved.status, saved.id as payment_id from moved, saved
    `);
    const row = (result as unknown as { rows: { bill_id: string; total_amount: string; paid_amount: string; status: string; payment_id: string }[] }).rows[0];

    if (!row) {
      // Nothing was written. Say why, using the bill as it is now (someone else may have just paid it).
      const now = await ownedBill(tenantId, billId);
      if (now.status === 'paid') throw new HttpError(409, 'This bill is already paid');
      if (now.status === 'void') throw new HttpError(409, 'This bill was cancelled with its booking');
      const left = Number(now.totalAmount) - Number(now.paidAmount ?? 0);
      throw new HttpError(409, `Only ${rupees(left)} is still owed on this bill.`);
    }

    return NextResponse.json({
      success: true,
      paymentId: row.payment_id,
      bill: { id: row.bill_id, status: row.status, totalAmount: Number(row.total_amount), paidAmount: Number(row.paid_amount) },
    });
  } catch (error) {
    return handleError(error, 'Failed to process payment');
  }
}
