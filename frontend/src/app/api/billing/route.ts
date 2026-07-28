import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bills, payments, bookings, orders } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import Stripe from 'stripe';
import { requireTenantContext } from '@/lib/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    // Fetch Open & Paid Bills for this Tenant
    const activeBills = await db.query.bills.findMany({
      where: inArray(bills.status, ['open', 'partial', 'paid']),
      with: {
        guest: true,
        booking: true,
      },
      orderBy: (bills, { desc }) => [desc(bills.createdAt)],
    });

    // Filter strictly to the current Hotel/Restaurant branch
    const tenantBills = activeBills.filter(bill => bill.guest?.tenantId === tenantId);

    // Format for the Front Desk UI
    const formattedBills = tenantBills.map(bill => ({
      id: bill.id,
      guestName: bill.guest?.name || 'Walk-in Guest',
      totalAmount: Number(bill.totalAmount),
      paidAmount: Number(bill.paidAmount) || 0,
      status: bill.status,
      createdAt: bill.createdAt,
      receipt: bill.itemsBreakdown || null, // Contains CGST, SGST, Subtotal, Totals, Items
      items: [] // Fallback backwards-compatibility
    }));

    return NextResponse.json(formattedBills);
  } catch (error) {
    console.error('Get bills error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bills' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    const body = await request.json();
    const { bookingId, items } = body;

    // Calculate total
    const totalAmount = items.reduce((sum: number, item: any) =>
      sum + (Number(item.amount) * item.quantity), 0
    );

    // Get booking to get guest ID
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Create bill
    const [bill] = await db.insert(bills).values({
      guestId: booking.guestId,
      bookingId,
      totalAmount: totalAmount.toString(),
      status: 'open',
    }).returning();

    return NextResponse.json({ success: true, bill });
  } catch (error) {
    console.error('Create bill error:', error);
    return NextResponse.json(
      { error: 'Failed to create bill' },
      { status: 500 }
    );
  }
}

// Close bill and process payment
export async function PATCH(request: NextRequest) {
  try {
    const context = await requireTenantContext();
    const { tenantId } = context;

    const body = await request.json();
    const { billId, paymentMethod } = body;

    const bill = await db.query.bills.findFirst({
      where: eq(bills.id, billId),
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // Standard POS Offline Checkout (Cash / UPI Native)
    if (paymentMethod === 'cash' || paymentMethod === 'upi') {
      const [updatedBill] = await db.update(bills)
        .set({
          status: 'paid',
          paidAmount: bill.totalAmount,
          settledAt: new Date()
        })
        .where(eq(bills.id, billId))
        .returning();

      await db.insert(payments).values({
        billId: bill.id,
        amount: bill.totalAmount,
        method: paymentMethod
      });

      return NextResponse.json({ success: true, bill: updatedBill });
    }

    // Advanced Hotel Kiosk Digital Payment Checkout
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(bill.totalAmount) * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        billId: bill.id,
        tenantId,
      },
    });

    // Record digital payment configuration
    await db.insert(payments).values({
      billId: bill.id,
      amount: bill.totalAmount,
      method: 'stripe',
      stripePaymentIntentId: paymentIntent.id,
    });

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    console.error('Process payment error:', error);
    return NextResponse.json(
      { error: 'Failed to process payment' },
      { status: 500 }
    );
  }
}
