import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bills, properties, tenants } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, assertUuid, handleError, notFound } from '@/lib/http';
import { financialYear, parseTaxSettings } from '@/lib/gst';
import { buildInvoiceSnapshot, buyerSchema, invoiceDocument, type BuyerInput, type InvoiceSnapshot } from '@/lib/invoice';
import { nightsBetween } from '@/lib/stay-bill';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadBill(tenantId: string, id: string) {
  assertUuid(id, 'Bill');
  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, id), eq(bills.tenantId, tenantId)),
    with: { guest: true, booking: { with: { room: true } }, payments: true, creditNotes: true },
  });
  if (!bill) throw notFound('Bill');
  return bill;
}

function documentOf(bill: Awaited<ReturnType<typeof loadBill>>) {
  if (!bill.invoiceNumber || !bill.invoiceIssuedAt || !bill.invoiceData) return null;
  return invoiceDocument({
    billId: bill.id, number: bill.invoiceNumber, issuedAt: bill.invoiceIssuedAt,
    snapshot: bill.invoiceData as InvoiceSnapshot, payments: bill.payments, creditNotes: bill.creditNotes,
  });
}

/** The issued invoice for a stay bill, with its payments as they stand now. 404 until one has been issued. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    const doc = documentOf(await loadBill(tenantId, params.id));
    if (!doc) throw notFound('Invoice');
    return NextResponse.json(doc);
  } catch (error) {
    return handleError(error, 'Failed to load the invoice');
  }
}

/**
 * Issues the invoice for a stay bill. Safe to repeat: the second call returns the invoice already issued, with the
 * same number. The number comes from one statement that locks the bill, takes the next number for the financial year,
 * and stamps it on the bill, so numbers never repeat and are never skipped, even when two people press the button.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    let buyer: BuyerInput = {};
    const raw = await request.text();
    if (raw.trim()) {
      let json: unknown;
      try { json = JSON.parse(raw); } catch { throw new HttpError(400, 'Request body must be valid JSON'); }
      buyer = buyerSchema.parse(json);
    }

    const bill = await loadBill(tenantId, params.id);
    const existing = documentOf(bill);
    if (existing) return NextResponse.json(existing);
    if (bill.kind !== 'stay' || !bill.booking?.room) throw new HttpError(409, 'Only a hotel stay bill can have an invoice.');
    if (bill.status === 'void') throw new HttpError(409, 'This bill was cancelled with its booking.');

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const [property] = await db.select().from(properties).where(and(eq(properties.id, bill.booking.propertyId), eq(properties.tenantId, tenantId))).limit(1);
    const settings = parseTaxSettings(tenant?.taxSettings);

    let snapshot: InvoiceSnapshot;
    try {
      snapshot = buildInvoiceSnapshot({
        tenantName: tenant?.name ?? '', settings, property: property ?? null,
        guest: bill.guest, room: bill.booking.room, booking: bill.booking,
        nights: nightsBetween(bill.booking.checkInDate, bill.booking.checkOutDate),
        breakdown: bill.itemsBreakdown as never, billTotal: Number(bill.totalAmount), buyer,
      });
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : 'Check the billing details.');
    }

    const fy = financialYear(tenant?.timezone ?? 'Asia/Kolkata');
    const prefix = settings.invoicePrefix;
    const result = await db.execute(sql`
      with target as (
        select id, tenant_id from bills
        where id = ${bill.id} and tenant_id = ${tenantId} and kind = 'stay' and status <> 'void' and invoice_number is null
        for update
      ), counter as (
        insert into invoice_counters (tenant_id, fy, series, last)
        select tenant_id, ${fy}, 'invoice', 1 from target
        on conflict (tenant_id, fy, series) do update set last = invoice_counters.last + 1
        returning last
      ), stamped as (
        update bills set
          invoice_seq = counter.last,
          invoice_number = ${prefix} || '/' || ${fy} || '/' || lpad(counter.last::text, 4, '0'),
          invoice_issued_at = now(),
          invoice_data = ${JSON.stringify(snapshot)}::jsonb
        from counter
        where bills.id = ${bill.id} and bills.tenant_id = ${tenantId} and bills.invoice_number is null
        returning bills.id
      )
      select id from stamped
    `);
    const stamped = (result as unknown as { rows: unknown[] }).rows.length > 0;

    // If nothing was stamped, someone else issued it a moment ago (or it was voided): return what is there now.
    const fresh = await loadBill(tenantId, params.id);
    const doc = documentOf(fresh);
    if (!doc) throw new HttpError(409, stamped ? 'The invoice could not be read back.' : 'This bill was cancelled with its booking.');
    return NextResponse.json(doc, { status: stamped ? 201 : 200 });
  } catch (error) {
    return handleError(error, 'Failed to issue the invoice');
  }
}
