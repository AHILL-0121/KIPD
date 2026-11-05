import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, tenants } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, assertUuid, handleError, notFound, parseJson } from '@/lib/http';
import { financialYear } from '@/lib/gst';
import { buildCreditSnapshot, creditNoteDocument, type CreditNoteSnapshot, type InvoiceSnapshot } from '@/lib/invoice';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const schema = z.object({
  /** The whole credit, tax included, in rupees with at most two decimals. Leave out and set `full` to credit what is left of the invoice. */
  amount: z.coerce.number().positive().max(10_000_000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most two decimal places').optional(),
  full: z.boolean().optional(),
  reason: z.string().trim().min(3, 'Say why the credit is being given').max(200),
}).refine((b) => b.full || b.amount !== undefined, { message: 'Enter an amount, or credit the whole invoice', path: ['amount'] });

async function loadBill(tenantId: string, id: string) {
  assertUuid(id, 'Bill');
  const bill = await db.query.bills.findFirst({ where: and(eq(bills.id, id), eq(bills.tenantId, tenantId)), with: { creditNotes: true } });
  if (!bill) throw notFound('Bill');
  return bill;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenant(ROLES.frontDesk);
    const bill = await loadBill(tenantId, params.id);
    return NextResponse.json(bill.creditNotes
      .slice().sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())
      .map((c) => creditNoteDocument({ id: c.id, billId: c.billId, number: c.number, issuedAt: c.issuedAt, issuedBy: c.issuedBy, snapshot: c.data as CreditNoteSnapshot })));
  } catch (error) {
    return handleError(error, 'Failed to load credit notes');
  }
}

/**
 * Issues a credit note against a stay's invoice: a discount, a correction, or a stay that was cancelled after invoicing.
 * It takes the next CN number and lowers the bill in one statement, so a number is never skipped or repeated.
 *
 * A credit can't take a live bill below what has already been paid: this system does not record refunds, so a guest who
 * has paid in full is refunded by hand, and the credit note is issued once the booking is cancelled (a cancelled stay's
 * invoice can be credited in full).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId, userName } = await requireTenant(ROLES.frontDesk);
    const body = await parseJson(request, schema);
    const bill = await loadBill(tenantId, params.id);

    if (!bill.invoiceNumber || !bill.invoiceData || !bill.invoiceIssuedAt) throw new HttpError(409, 'Only an issued invoice can be credited. Issue the invoice first.');
    const invoice = bill.invoiceData as InvoiceSnapshot;
    const invoicePaise = Math.round(invoice.total * 100);
    const creditedPaise = bill.creditNotes.reduce((s, c) => s + Math.round(Number(c.amount) * 100), 0);
    const leftPaise = invoicePaise - creditedPaise;
    if (leftPaise <= 0) throw new HttpError(409, 'This invoice has already been credited in full.');

    const amountPaise = body.full ? leftPaise : Math.round((body.amount ?? 0) * 100);
    if (amountPaise > leftPaise) throw new HttpError(409, `Only ${rupees(leftPaise)} of this invoice can still be credited.`);
    if (bill.status !== 'void') {
      const unpaidPaise = Math.round((Number(bill.totalAmount) - Number(bill.paidAmount ?? 0)) * 100);
      if (amountPaise > unpaidPaise) {
        throw new HttpError(409, unpaidPaise <= 0
          ? 'This stay is paid in full. A credit note would mean refunding the guest, which is not recorded here. Cancel the booking if the stay is cancelled, then credit the invoice.'
          : `Only ${rupees(unpaidPaise)} of this bill is still unpaid, and a credit note cannot take it below what has been paid.`);
      }
    }

    const [tenant] = await db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const fy = financialYear(tenant?.timezone ?? 'Asia/Kolkata');
    const snapshot = buildCreditSnapshot({ invoice, invoiceNumber: bill.invoiceNumber, invoiceDate: bill.invoiceIssuedAt, amountPaise, reason: body.reason });
    const amount = (amountPaise / 100).toFixed(2);

    const result = await db.execute(sql`
      with target as (
        select id, tenant_id from bills
        where id = ${bill.id} and tenant_id = ${tenantId} and invoice_number is not null
          and (status = 'void' or (status in ('open', 'partial', 'paid') and total_amount - coalesce(paid_amount, 0) >= ${amount}::numeric))
          and coalesce((select sum(c.amount) from credit_notes c where c.tenant_id = bills.tenant_id and c.bill_id = bills.id), 0) + ${amount}::numeric
              <= (invoice_data->>'total')::numeric
        for update
      ), counter as (
        insert into invoice_counters (tenant_id, fy, series, last)
        select tenant_id, ${fy}, 'credit_note', 1 from target
        on conflict (tenant_id, fy, series) do update set last = invoice_counters.last + 1
        returning last
      ), note as (
        insert into credit_notes (tenant_id, bill_id, number, seq, amount, reason, data, issued_by)
        select target.tenant_id, target.id, 'CN/' || ${fy} || '/' || lpad(counter.last::text, 4, '0'), counter.last,
               ${amount}::numeric, ${body.reason}, ${JSON.stringify(snapshot)}::jsonb, ${userName}
        from target, counter
        returning id
      ), lowered as (
        update bills set
          total_amount = total_amount - ${amount}::numeric,
          status = case when coalesce(paid_amount, 0) >= total_amount - ${amount}::numeric then 'paid' else status end,
          settled_at = case when coalesce(paid_amount, 0) >= total_amount - ${amount}::numeric then coalesce(settled_at, now()) else settled_at end
        where id = ${bill.id} and tenant_id = ${tenantId} and status <> 'void' and exists (select 1 from note)
        returning id
      )
      select id from note
    `);
    const row = (result as unknown as { rows: { id: string }[] }).rows[0];
    if (!row) throw new HttpError(409, 'The bill changed while the credit note was being issued. Please check it and try again.');

    const fresh = await db.query.creditNotes.findFirst({ where: (c) => and(eq(c.id, row.id), eq(c.tenantId, tenantId)) });
    if (!fresh) throw new HttpError(500, 'The credit note could not be read back.');
    return NextResponse.json(creditNoteDocument({ id: fresh.id, billId: fresh.billId, number: fresh.number, issuedAt: fresh.issuedAt, issuedBy: fresh.issuedBy, snapshot: fresh.data as CreditNoteSnapshot }), { status: 201 });
  } catch (error) {
    return handleError(error, 'Failed to issue the credit note');
  }
}
