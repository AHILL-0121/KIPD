import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { format } from 'date-fns';
import { db } from '@/db';
import { bills, properties, tenants } from '@/db/schema';
import { ROLES, requireArea, requireTenant } from '@/lib/auth';
import { assertUuid, badRequest, handleError, notFound } from '@/lib/http';
import { realEmail } from '@/lib/guest-email';
import { emailTemplates, sendEmail } from '@/lib/email';
import { writeTenantAudit } from '@/lib/audit';
import { amountInWords } from '@/lib/gst';
import { taxRowsOf, type InvoiceSnapshot } from '@/lib/invoice';
import { buildInvoicePdf, type PdfLineItem, type PdfTaxLine } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200).optional(),
});

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  razorpay: 'Online payment',
  stripe: 'Card (online)',
};

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireTenant(ROLES.frontDesk);
    const { tenantId, userId, userName } = ctx;
    const billId = assertUuid(params.id, 'Bill');

    let overrideEmail: string | undefined;
    const raw = await request.text();
    if (raw.trim()) {
      let json: unknown;
      try { json = JSON.parse(raw); } catch { throw badRequest('Request body must be valid JSON'); }
      overrideEmail = bodySchema.parse(json).email;
    }

    const bill = await db.query.bills.findFirst({
      where: and(eq(bills.id, billId), eq(bills.tenantId, tenantId)),
      with: {
        guest: true,
        booking: { with: { property: true, room: true } },
        payments: true,
        creditNotes: true,
      },
    });
    if (!bill) throw notFound('Bill');
    if (bill.kind === 'stay') requireArea(ctx, 'hotel');
    if (bill.kind === 'restaurant') requireArea(ctx, 'restaurant');

    const toEmail = overrideEmail || realEmail(bill.guest?.email);
    if (!toEmail) throw badRequest('Enter a guest email address to send the receipt.');

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const [property] = bill.booking?.property
      ? [bill.booking.property]
      : await db.select().from(properties).where(eq(properties.tenantId, tenantId)).limit(1);

    const propertyName = property?.name || tenant?.name || 'Kipd';
    const paid = Number(bill.paidAmount ?? 0);
    const credited = bill.creditNotes.reduce((s, c) => s + Number(c.amount), 0);

    let total = Number(bill.totalAmount);
    let lines: { name: string; qty: number; rate: number; amount: number }[] = [];
    let pdfLines: PdfLineItem[] = [];
    let taxLines: PdfTaxLine[] = [];
    let subtotal: number | undefined;
    let taxTotal: number | undefined;
    let title = bill.invoiceNumber ? 'Tax Invoice' : bill.kind === 'stay' ? 'Stay Receipt' : 'Dining Receipt';

    const snap = bill.invoiceData as InvoiceSnapshot | null;
    if (snap) {
      title = snap.title || title;
      total = snap.total;
      subtotal = snap.taxable;
      taxTotal = Math.round((snap.total - snap.taxable) * 100) / 100;
      lines = snap.lines.map((l) => ({ name: l.description, qty: l.qty, rate: l.rate, amount: l.taxable }));
      pdfLines = snap.lines.map((l) => ({
        description: l.description,
        sublabel: `SAC ${l.sac}${l.gstRate ? ` · GST ${Math.round(l.gstRate * 100) / 100}%` : ''}`,
        qty: l.qty,
        rate: l.rate,
        amount: l.taxable,
      }));
      for (const r of taxRowsOf(snap as never)) {
        if (r.cgst + r.sgst + r.igst <= 0) continue;
        if (snap.interState) {
          taxLines.push({ label: `IGST @ ${Math.round(r.rate * 100) / 100}%`, amount: r.igst });
        } else {
          taxLines.push({ label: `CGST @ ${Math.round((r.rate / 2) * 100) / 100}%`, amount: r.cgst });
          taxLines.push({ label: `SGST @ ${Math.round((r.rate / 2) * 100) / 100}%`, amount: r.sgst });
        }
      }
    } else if (bill.itemsBreakdown && typeof bill.itemsBreakdown === 'object') {
      const bd = bill.itemsBreakdown as {
        items?: { name: string; qty?: number; quantity?: number; rate?: number; price?: number; amt?: number }[];
        subtotal?: number;
        cgst?: number;
        sgst?: number;
        igst?: number;
      };
      if (Array.isArray(bd.items)) {
        lines = bd.items.map((i) => {
          const qty = Number(i.qty ?? i.quantity ?? 1);
          const rate = Number(i.rate ?? i.price ?? 0);
          const amt = Number(i.amt ?? rate * qty);
          return { name: i.name, qty, rate, amount: amt };
        });
        pdfLines = lines.map((l) => ({ description: l.name, qty: l.qty, rate: l.rate, amount: l.amount }));
      }
      if (typeof bd.subtotal === 'number') subtotal = bd.subtotal;
      const cgst = Number(bd.cgst ?? 0);
      const sgst = Number(bd.sgst ?? 0);
      const igst = Number(bd.igst ?? 0);
      if (cgst > 0) taxLines.push({ label: 'CGST', amount: cgst });
      if (sgst > 0) taxLines.push({ label: 'SGST', amount: sgst });
      if (igst > 0) taxLines.push({ label: 'IGST', amount: igst });
      const tax = cgst + sgst + igst;
      if (tax > 0) taxTotal = Math.round(tax * 100) / 100;
    }

    if (lines.length === 0) {
      const fallbackName = bill.kind === 'stay' ? 'Hotel Stay Charges' : 'Restaurant Charges';
      lines = [{ name: fallbackName, qty: 1, rate: total, amount: total }];
      pdfLines = [{ description: fallbackName, qty: 1, rate: total, amount: total }];
    }

    const balance = Math.max(0, Math.round((total - credited - paid) * 100) / 100);
    const referenceNumber = bill.invoiceNumber || `BILL-${bill.id.slice(0, 8).toUpperCase()}`;
    const issuedDate = format(bill.invoiceIssuedAt ? new Date(bill.invoiceIssuedAt) : new Date(bill.createdAt), 'd MMM yyyy');

    const pdfBuffer = buildInvoicePdf({
      title,
      documentNumber: referenceNumber,
      issuedDate,
      seller: snap
        ? {
            name: snap.seller.name,
            address: snap.seller.address,
            phone: snap.seller.phone,
            email: snap.seller.email,
            gstin: snap.seller.gstin,
            stateLabel: snap.seller.stateName ? `${snap.seller.stateName} (${snap.seller.stateCode})` : null,
          }
        : {
            name: propertyName,
            address: property?.address ?? null,
            phone: property?.phone ?? null,
            email: property?.email ?? null,
          },
      buyer: snap
        ? {
            name: snap.buyer.name,
            address: snap.buyer.address,
            gstin: snap.buyer.gstin,
            phone: snap.buyer.phone,
            email: realEmail(snap.buyer.email),
            placeOfSupply: snap.placeOfSupply,
          }
        : {
            name: bill.guest?.name || 'Guest',
            phone: bill.guest?.phone ?? null,
            email: realEmail(bill.guest?.email),
          },
      stay: snap
        ? {
            roomNumber: snap.stay.roomNumber,
            checkIn: format(new Date(snap.stay.checkIn), 'd MMM yyyy, h:mm a'),
            checkOut: format(new Date(snap.stay.checkOut), 'd MMM yyyy, h:mm a'),
            nights: snap.stay.nights,
          }
        : undefined,
      lines: pdfLines,
      taxableLabel: snap ? 'Taxable value' : 'Subtotal',
      taxableAmount: subtotal,
      taxLines,
      total,
      totalInWords: amountInWords(total),
      payments: bill.payments
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({
          date: format(new Date(p.createdAt), 'd MMM yyyy'),
          method: METHOD_LABEL[p.method] ?? p.method,
          reference: p.reference,
          amount: Number(p.amount),
        })),
      credits: bill.creditNotes
        .slice()
        .sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())
        .map((c) => ({
          number: c.number,
          date: format(new Date(c.issuedAt), 'd MMM yyyy'),
          reason: c.reason,
          amount: Number(c.amount),
        })),
      paidTotal: paid,
      balanceDue: balance,
      footer: snap?.terms || undefined,
    });

    const safeFileName = `${title.replace(/\s+/g, '_')}_${referenceNumber.replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;

    const res = await sendEmail({
      to: toEmail,
      subject: `${title} (${referenceNumber}) — ${propertyName}`,
      html: emailTemplates.invoiceReceipt({
        guestName: bill.guest?.name || 'Guest',
        propertyName,
        title,
        referenceNumber,
        issuedDate,
        lines,
        subtotal,
        taxTotal,
        credited,
        total,
        paid,
        balance,
        hasAttachment: true,
      }),
      attachments: [
        {
          filename: safeFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    if (!res.success) {
      throw new Error('Could not send the email. Check SMTP settings in environment variables.');
    }

    void writeTenantAudit({
      tenantId,
      actorUserId: userId,
      actorName: userName,
      action: 'bill.email_receipt',
      targetType: 'bill',
      targetId: bill.id,
      metadata: { toEmail, referenceNumber, attachment: safeFileName },
    });

    return NextResponse.json({ success: true, sentTo: toEmail });
  } catch (error) {
    return handleError(error, 'Failed to email the receipt');
  }
}
