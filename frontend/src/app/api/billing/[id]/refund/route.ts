import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, refunds } from '@/db/schema';
import { ROLES, requireArea, requireTenant } from '@/lib/auth';
import { HttpError, assertUuid, handleError, notFound, parseJson } from '@/lib/http';
import { MANUAL_METHODS } from '@/lib/payment-settings';
import { writeTenantAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const paise = z.coerce
  .number()
  .positive()
  .max(10_000_000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most two decimal places');

const refundSchema = z.object({
  amount: paise,
  method: z.enum([...MANUAL_METHODS, 'razorpay']).default('cash'),
  reference: z.string().trim().max(60).optional(),
  reason: z.string().trim().min(3, 'Enter a reason for the refund').max(200),
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireTenant(ROLES.frontDesk);
    const billId = assertUuid(params.id, 'Bill');

    const bill = await db.query.bills.findFirst({
      where: and(eq(bills.id, billId), eq(bills.tenantId, ctx.tenantId)),
      with: { refunds: true },
    });
    if (!bill) throw notFound('Bill');
    if (bill.kind === 'stay') requireArea(ctx, 'hotel');
    if (bill.kind === 'restaurant') requireArea(ctx, 'restaurant');

    return NextResponse.json(
      bill.refunds
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((r) => ({
          id: r.id,
          amount: Number(r.amount),
          method: r.method,
          reference: r.reference,
          reason: r.reason,
          processedBy: r.processedBy,
          createdAt: r.createdAt,
        })),
    );
  } catch (error) {
    return handleError(error, 'Failed to fetch refunds');
  }
}

/**
 * Records a deposit or payment refund against a bill (most commonly a cancelled booking's voided bill).
 * Refuses to refund more than `paidAmount - alreadyRefunded` in a single atomic SQL statement.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireTenant(ROLES.frontDesk);
    const { tenantId, userId, userName } = ctx;
    const billId = assertUuid(params.id, 'Bill');
    const body = await parseJson(request, refundSchema);

    const existing = await db.query.bills.findFirst({
      where: and(eq(bills.id, billId), eq(bills.tenantId, tenantId)),
      with: { refunds: true },
    });
    if (!existing) throw notFound('Bill');
    if (existing.kind === 'stay') requireArea(ctx, 'hotel');
    if (existing.kind === 'restaurant') requireArea(ctx, 'restaurant');

    const paidPaise = Math.round(Number(existing.paidAmount ?? 0) * 100);
    const refundedPaise = existing.refunds.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
    const refundablePaise = Math.max(0, paidPaise - refundedPaise);
    const reqPaise = Math.round(body.amount * 100);

    if (refundablePaise <= 0) {
      throw new HttpError(409, 'There is no refundable payment left on this bill.');
    }
    if (reqPaise > refundablePaise) {
      throw new HttpError(409, `Only ₹${(refundablePaise / 100).toFixed(2)} can be refunded on this bill.`);
    }

    const amountStr = (reqPaise / 100).toFixed(2);
    const result = await db.execute(sql`
      with target as (
        select id, tenant_id, booking_id from bills
        where id = ${existing.id} and tenant_id = ${tenantId}
          and coalesce(paid_amount, 0) - coalesce((
            select sum(r.amount) from refunds r where r.tenant_id = bills.tenant_id and r.bill_id = bills.id
          ), 0) >= ${amountStr}::numeric
        for update
      ), inserted as (
        insert into refunds (tenant_id, bill_id, booking_id, amount, method, reference, reason, processed_by, processed_by_user_id)
        select target.tenant_id, target.id, target.booking_id, ${amountStr}::numeric, ${body.method}, ${body.reference || null}, ${body.reason}, ${userName}, ${userId}
        from target
        returning id, created_at
      )
      select id, created_at from inserted
    `);

    const row = (result as unknown as { rows: { id: string; created_at: string }[] }).rows[0];
    if (!row) {
      throw new HttpError(409, 'Refund could not be recorded because the refundable balance changed. Please refresh and try again.');
    }

    void writeTenantAudit({
      tenantId,
      actorUserId: userId,
      actorName: userName,
      action: 'bill.refund',
      targetType: 'bill',
      targetId: existing.id,
      metadata: {
        refundId: row.id,
        bookingId: existing.bookingId,
        amount: Number(amountStr),
        method: body.method,
        reason: body.reason,
      },
    });

    return NextResponse.json(
      {
        success: true,
        refund: {
          id: row.id,
          amount: Number(amountStr),
          method: body.method,
          reference: body.reference || null,
          reason: body.reason,
          processedBy: userName,
          createdAt: row.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error, 'Failed to record refund');
  }
}
