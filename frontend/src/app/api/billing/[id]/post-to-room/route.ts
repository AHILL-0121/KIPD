import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, assertUuid, handleError, notFound, parseJson } from '@/lib/http';
import { postCharges, restaurantRate, type StayBreakdown } from '@/lib/stay-bill';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const schema = z.object({ stayBillId: z.string().uuid() });

async function loadBill(tenantId: string, id: string, what: string) {
  assertUuid(id, what);
  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, id), eq(bills.tenantId, tenantId)),
    with: { booking: true },
  });
  if (!bill) throw notFound(what);
  return bill;
}

/**
 * Charges a restaurant bill to a guest who is staying: its lines move onto that guest's stay bill (each at the food GST
 * rate it was billed at) and the restaurant bill is closed as "posted". It happens in one statement, so a charge can
 * never be on both bills, or on neither. It is refused once the stay's invoice has been issued, because an issued
 * invoice never changes, and when anything has already been paid on the restaurant bill.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId, userName } = await requireTenant(ROLES.frontDesk);
    const { stayBillId } = await parseJson(request, schema);

    const food = await loadBill(tenantId, params.id, 'Bill');
    const stay = await loadBill(tenantId, stayBillId, 'Stay bill');

    if (food.kind !== 'restaurant') throw new HttpError(409, 'Only a restaurant bill can be charged to a room.');
    if (food.status === 'posted') throw new HttpError(409, 'This bill has already been charged to a room.');
    if (food.status !== 'open' || Number(food.paidAmount ?? 0) > 0) throw new HttpError(409, 'Only an unpaid restaurant bill can be charged to a room.');
    if (stay.kind !== 'stay' || !stay.booking) throw new HttpError(409, "Choose a guest's stay bill.");
    if (stay.booking.status !== 'checked_in') throw new HttpError(409, 'Charges can only be posted to a guest who is checked in.');
    if (stay.status === 'void') throw new HttpError(409, 'That stay was cancelled.');
    if (stay.invoiceNumber) throw new HttpError(409, `Invoice ${stay.invoiceNumber} has already been issued for this stay, and an issued invoice cannot change. Collect this bill separately.`);

    const receipt = food.itemsBreakdown as { items?: { name: string; qty: number; rate: number; amt: number }[]; subtotal?: number; cgst?: number; sgst?: number } | null;
    if (!receipt?.items?.length) throw new HttpError(409, 'This bill has no items to post.');

    const { breakdown, totalPaise } = postCharges(stay.itemsBreakdown as Partial<StayBreakdown> | null, {
      items: receipt.items, ratePercent: restaurantRate(receipt), billId: food.id, by: userName, at: new Date(),
    });
    const oldPaise = Math.round(Number(stay.totalAmount) * 100);
    if (totalPaise <= oldPaise) throw new HttpError(409, 'There is nothing to post: this bill has no value.');
    const newTotal = (totalPaise / 100).toFixed(2);

    // One statement. The stay bill is locked first, and only if it is still exactly as read (open, uninvoiced, same total);
    // then the restaurant bill is closed and the stay bill raised. If anything changed, nothing is written.
    const result = await db.execute(sql`
      with dst as (
        select id from bills
        where id = ${stay.id} and tenant_id = ${tenantId} and kind = 'stay' and status in ('open', 'partial', 'paid')
          and invoice_number is null and total_amount = ${stay.totalAmount}::numeric
        for update
      ), src as (
        update bills set status = 'posted', posted_to_bill_id = ${stay.id}
        where id = ${food.id} and tenant_id = ${tenantId} and kind = 'restaurant' and status = 'open' and coalesce(paid_amount, 0) = 0
          and exists (select 1 from dst)
        returning id
      ), raised as (
        update bills set
          items_breakdown = ${JSON.stringify(breakdown)}::jsonb,
          total_amount = ${newTotal}::numeric,
          status = case when coalesce(paid_amount, 0) >= ${newTotal}::numeric then 'paid' when coalesce(paid_amount, 0) > 0 then 'partial' else 'open' end,
          settled_at = case when coalesce(paid_amount, 0) >= ${newTotal}::numeric then settled_at else null end
        where id = ${stay.id} and tenant_id = ${tenantId} and exists (select 1 from src)
        returning id
      )
      select id from raised
    `);
    if ((result as unknown as { rows: unknown[] }).rows.length === 0) {
      throw new HttpError(409, 'The bills changed while you were posting. Please check them and try again.');
    }

    return NextResponse.json({ success: true, stayBillId: stay.id, posted: (totalPaise - oldPaise) / 100, stayTotal: totalPaise / 100 });
  } catch (error) {
    return handleError(error, 'Failed to charge the bill to the room');
  }
}
