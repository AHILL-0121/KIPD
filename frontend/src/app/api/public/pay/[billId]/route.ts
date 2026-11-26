import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, tenants, upiPaymentIntents } from '@/db/schema';
import { assertUuid, handleError, notFound } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getPaymentSettings } from '@/lib/payment-settings';
import { getRazorpayAccount } from '@/lib/razorpay-account';
import { createPaymentLink, createPaymentQr, QR_LIFETIME_SECONDS } from '@/lib/razorpay';
import { buildUpiPaymentUrl } from '@/lib/upi-qr';

export const dynamic = 'force-dynamic';

const createIntentSchema = z.object({
  mode: z.enum(['razorpay_link', 'razorpay_qr', 'upi_intent']).optional(),
}).optional();

async function loadPublicBill(billId: string) {
  const [bill] = await db.select().from(bills).where(eq(bills.id, billId)).limit(1);
  if (!bill || bill.kind !== 'restaurant' || bill.status === 'void' || bill.status === 'posted') {
    throw notFound('Bill');
  }

  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, status: tenants.status, deletedAt: tenants.deletedAt })
    .from(tenants)
    .where(eq(tenants.id, bill.tenantId))
    .limit(1);

  if (!tenant || tenant.deletedAt || tenant.status !== 'active') throw notFound('Bill');
  return { bill, tenant };
}

export async function GET(request: NextRequest, { params }: { params: { billId: string } }) {
  try {
    await enforceRateLimit(request, 'pub-pay-read', 90, 60);
    const billId = assertUuid(params.billId, 'Bill');
    const { bill, tenant } = await loadPublicBill(billId);

    const [settings, account, [latestIntent]] = await Promise.all([
      getPaymentSettings(tenant.id),
      getRazorpayAccount(tenant.id),
      db
        .select()
        .from(upiPaymentIntents)
        .where(and(eq(upiPaymentIntents.billId, bill.id), eq(upiPaymentIntents.tenantId, tenant.id)))
        .orderBy(desc(upiPaymentIntents.createdAt))
        .limit(1),
    ]);

    const totalAmount = Number(bill.totalAmount);
    const paidAmount = Number(bill.paidAmount ?? 0);
    const remainingAmount = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);
    const razorpayEnabled = Boolean(settings.onlinePayments && account?.webhookSecret);
    const directUpiEnabled = Boolean(settings.directUpiQr && settings.upiId.trim());

    const directUpiUrl =
      directUpiEnabled && remainingAmount > 0
        ? buildUpiPaymentUrl({
            upiId: settings.upiId,
            payeeName: settings.upiName || tenant.name,
            amount: remainingAmount,
            tenantName: tenant.name,
          })
        : null;

    return NextResponse.json({
      restaurantName: tenant.name,
      bill: {
        id: bill.id,
        status: bill.status,
        totalAmount,
        paidAmount,
        remainingAmount,
        itemsBreakdown: bill.itemsBreakdown,
        createdAt: bill.createdAt,
        settledAt: bill.settledAt,
      },
      methods: {
        razorpay: razorpayEnabled,
        directUpi: directUpiEnabled,
      },
      directUpiUrl,
      activeIntent: latestIntent
        ? {
            id: latestIntent.id,
            status: latestIntent.status,
            amount: Number(latestIntent.amount),
            paymentLinkUrl: latestIntent.paymentLinkUrl,
            shortUrl: latestIntent.shortUrl,
            expiresAt: latestIntent.expiresAt,
          }
        : null,
    });
  } catch (error) {
    return handleError(error, 'Could not load table bill');
  }
}

export async function POST(request: NextRequest, { params }: { params: { billId: string } }) {
  try {
    await enforceRateLimit(request, 'pub-pay-create', 20, 60);
    const billId = assertUuid(params.billId, 'Bill');
    const raw = await request.text();
    const parsed = raw ? createIntentSchema.parse(JSON.parse(raw)) : undefined;

    const { bill, tenant } = await loadPublicBill(billId);
    if (bill.status === 'paid') {
      return NextResponse.json({ error: 'This bill is already paid.' }, { status: 409 });
    }

    const totalAmount = Number(bill.totalAmount);
    const paidAmount = Number(bill.paidAmount ?? 0);
    const remainingPaise = Math.round((totalAmount - paidAmount) * 100);
    if (remainingPaise < 100) {
      return NextResponse.json({ error: 'Amount due must be at least ₹1.' }, { status: 400 });
    }

    const [settings, account] = await Promise.all([
      getPaymentSettings(tenant.id),
      getRazorpayAccount(tenant.id),
    ]);
    const razorpayEnabled = Boolean(settings.onlinePayments && account?.webhookSecret);
    const directUpiEnabled = Boolean(settings.directUpiQr && settings.upiId.trim());

    const chosenMode =
      parsed?.mode ??
      (razorpayEnabled ? 'razorpay_link' : directUpiEnabled ? 'upi_intent' : null);

    if (!chosenMode) {
      return NextResponse.json(
        { error: 'Pay at table is not enabled by this restaurant yet. Please pay at the counter.' },
        { status: 409 },
      );
    }

    if ((chosenMode === 'razorpay_link' || chosenMode === 'razorpay_qr') && (!razorpayEnabled || !account)) {
      return NextResponse.json({ error: 'Online Razorpay payments are not active.' }, { status: 409 });
    }

    if (chosenMode === 'upi_intent') {
      if (!directUpiEnabled) {
        return NextResponse.json({ error: 'Direct UPI is not configured.' }, { status: 409 });
      }
      const upiUrl = buildUpiPaymentUrl({
        upiId: settings.upiId,
        payeeName: settings.upiName || tenant.name,
        amount: remainingPaise / 100,
        tenantName: tenant.name,
      });
      const [intent] = await db
        .insert(upiPaymentIntents)
        .values({
          tenantId: tenant.id,
          billId: bill.id,
          amount: (remainingPaise / 100).toFixed(2),
          currency: 'INR',
          paymentLinkUrl: upiUrl,
          status: 'created',
        })
        .returning();

      return NextResponse.json({
        mode: 'upi_intent',
        intentId: intent.id,
        upiUrl,
        amount: remainingPaise / 100,
      });
    }

    if (chosenMode === 'razorpay_qr' && account) {
      const qr = await createPaymentQr(account, {
        amountPaise: remainingPaise,
        description: `${tenant.name} — Pay at Table`,
        billId: bill.id,
        tenantId: tenant.id,
      });
      const [intent] = await db
        .insert(upiPaymentIntents)
        .values({
          tenantId: tenant.id,
          billId: bill.id,
          amount: qr.amount.toFixed(2),
          currency: 'INR',
          razorpayOrderId: qr.id,
          paymentLinkUrl: qr.imageUrl,
          status: 'created',
          expiresAt: new Date(qr.expiresAt),
        })
        .returning();

      return NextResponse.json({
        mode: 'razorpay_qr',
        intentId: intent.id,
        qrImageUrl: qr.imageUrl,
        expiresAt: qr.expiresAt,
        amount: qr.amount,
      });
    }

    const link = await createPaymentLink(account!, {
      amountPaise: remainingPaise,
      description: `${tenant.name} — Pay at Table`,
      billId: bill.id,
      tenantId: tenant.id,
    });
    const expiresAt = new Date(Date.now() + QR_LIFETIME_SECONDS * 1000);
    const [intent] = await db
      .insert(upiPaymentIntents)
      .values({
        tenantId: tenant.id,
        billId: bill.id,
        amount: link.amount.toFixed(2),
        currency: 'INR',
        razorpayPaymentLinkId: link.id,
        paymentLinkUrl: link.url,
        shortUrl: link.url,
        status: 'created',
        expiresAt,
      })
      .returning();

    return NextResponse.json({
      mode: 'razorpay_link',
      intentId: intent.id,
      paymentLinkUrl: link.url,
      shortUrl: link.url,
      amount: link.amount,
    });
  } catch (error) {
    return handleError(error, 'Could not start Pay at Table payment');
  }
}
