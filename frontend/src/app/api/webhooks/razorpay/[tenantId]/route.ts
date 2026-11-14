import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { verifyWebhookSignature } from '@/lib/razorpay';
import { getRazorpayAccount } from '@/lib/razorpay-account';

export const dynamic = 'force-dynamic';

/**
 * Razorpay calls this (no login) when a payment link is paid or a QR code is paid. Every business has its own address
 * (its id is in the path) and its own secret, set up in Settings > Payments. A request is trusted only because the
 * body's HMAC matches THAT business's secret, so one business's Razorpay account can never mark another's bill paid.
 * Nothing else in the request is believed until that check passes.
 *
 * Idempotent: Razorpay retries, so the same payment can arrive more than once. payments.razorpay_payment_id is
 * unique, and the bill update and the payment insert are ONE statement, so a repeat changes nothing.
 */
const eventSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment_link: z.object({ entity: z.object({ notes: z.record(z.unknown()).nullish() }).passthrough() }).optional(),
    qr_code: z.object({ entity: z.object({ notes: z.record(z.unknown()).nullish() }).passthrough() }).optional(),
    payment: z.object({ entity: z.object({ id: z.string(), amount: z.number().int().positive(), status: z.string().optional() }).passthrough() }).optional(),
  }).passthrough(),
}).passthrough();

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: { tenantId: string } }) {
  const raw = await request.text();
  // An unknown business, one with no secret yet, and a bad signature all get the same answer.
  let secret: string | null = null;
  if (uuidRe.test(params.tenantId)) {
    try {
      secret = (await getRazorpayAccount(params.tenantId))?.webhookSecret ?? null;
    } catch (error) {
      console.error('Razorpay webhook could not load the account', error);
      return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }
  }
  if (!verifyWebhookSignature(raw, request.headers.get('x-razorpay-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(raw));
  } catch {
    // Signed but not the shape we handle. Acknowledge so Razorpay does not retry forever.
    return NextResponse.json({ received: true, ignored: 'unreadable event' });
  }

  // Only a paid link or a paid QR means money arrived. Everything else (created, expired, closed) is acknowledged and ignored.
  const viaQr = event.event === 'qr_code.credited';
  if (event.event !== 'payment_link.paid' && !viaQr) return NextResponse.json({ received: true, ignored: event.event });

  const payment = event.payload.payment?.entity;
  const notes = (viaQr ? event.payload.qr_code?.entity.notes : event.payload.payment_link?.entity.notes) ?? {};
  const billId = String(notes.billId ?? '');
  // The business is the one whose secret signed this request (the path), never one named inside the body.
  const tenantId = params.tenantId;
  if (!payment || !uuidRe.test(billId) || String(notes.tenantId ?? tenantId) !== tenantId) {
    console.error('Razorpay paid event without a usable bill reference');
    return NextResponse.json({ received: true, ignored: 'no bill reference' });
  }

  const pay = (payment.amount / 100).toFixed(2);
  try {
    // Adds the payment AND moves the bill, only when it still fits within what is owed and this payment id is new.
    const result = await db.execute(sql`
      with moved as (
        update bills set
          paid_amount = coalesce(paid_amount, 0) + ${pay}::numeric,
          status = case when coalesce(paid_amount, 0) + ${pay}::numeric >= total_amount then 'paid' else 'partial' end,
          settled_at = case when coalesce(paid_amount, 0) + ${pay}::numeric >= total_amount then now() else settled_at end
        where id = ${billId} and tenant_id = ${tenantId}
          and status in ('open', 'partial')
          and coalesce(paid_amount, 0) + ${pay}::numeric <= total_amount
          and not exists (select 1 from payments where razorpay_payment_id = ${payment.id})
        returning id, tenant_id
      ), saved as (
        insert into payments (tenant_id, bill_id, amount, method, reference, received_by, razorpay_payment_id, note)
        select tenant_id, id, ${pay}::numeric, 'razorpay', ${payment.id}, 'Razorpay', ${payment.id}, ${viaQr ? 'Paid by scanning the QR code' : 'Paid by online payment link'}::text from moved
        returning id
      )
      select id from saved
    `);
    const recorded = ((result as unknown as { rows: unknown[] }).rows ?? []).length > 0;
    if (recorded) return NextResponse.json({ received: true });

    // Not recorded: either we already have this payment (a retry), or the bill cannot take it (already paid, cancelled,
    // or the link was for more than is now owed). Real money may still have moved, so never lose track of it.
    const seen = await db.execute(sql`select 1 from payments where razorpay_payment_id = ${payment.id} limit 1`);
    if (((seen as unknown as { rows: unknown[] }).rows ?? []).length > 0) return NextResponse.json({ received: true, duplicate: true });

    await db.execute(sql`
      insert into payment_events (tenant_id, source, source_app, raw_payload, parsed_amount, parsed_reference, matched_bill_id, match_confidence)
      select t.id, 'webhook', 'razorpay', ${raw}, ${pay}::numeric, ${payment.id}, b.id, 'unmatched'
      from tenants t left join bills b on b.id = ${billId} and b.tenant_id = t.id
      where t.id = ${tenantId}
      on conflict do nothing
    `);
    console.error('Razorpay payment could not be applied to its bill; saved for review', payment.id);
    return NextResponse.json({ received: true, needsReview: true });
  } catch (error) {
    // A concurrent delivery of the same payment loses the unique index race and rolls back whole: treat as a repeat.
    // Drizzle wraps the driver's error: the constraint name is on `cause`, the outer message is just "Failed query".
    const text = [error, (error as { cause?: unknown })?.cause].map((e) => String((e as { message?: string })?.message ?? e)).join(' ');
    if (text.includes('payments_razorpay_payment_uq')) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('Razorpay webhook failed', error);
    // 500 makes Razorpay retry later, which is what we want for a temporary database problem.
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
