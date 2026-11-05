import { z } from 'zod';
import { ROOM_SAC, amountInWords, isGstin, splitGst, stateName, taxGroups, GST_STATES, type TaxSettings } from '@/lib/gst';

/**
 * A stay invoice. Everything on it that must never change (who billed whom, the lines, the tax) is frozen into
 * `bills.invoice_data` when the invoice is issued. Only the payments and credit notes are read live, because a guest
 * can still pay the balance, or be credited, after the invoice is given out.
 */
export interface TaxRow { rate: number; taxable: number; cgst: number; sgst: number; igst: number }

export interface InvoiceSnapshot {
  title: 'Tax Invoice' | 'Invoice';
  seller: { name: string; gstin: string; address: string; stateCode: string; stateName: string; phone: string; email: string };
  buyer: { name: string; gstin: string; address: string; stateCode: string; stateName: string; email: string; phone: string };
  placeOfSupply: string;
  interState: boolean;
  stay: { roomNumber: string; checkIn: string; checkOut: string; nights: number; guests: number | null };
  lines: { description: string; sac: string; qty: number; rate: number; taxable: number; gstRate?: number }[];
  /** One row per GST rate on the invoice (room and food can differ). */
  taxes: TaxRow[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  bankDetails: string;
  terms: string;
}

/** Who the invoice is made out to. Everything is optional: the guest's own name is used when none is given. */
export const buyerSchema = z.object({
  name: z.string().trim().max(120).optional(),
  gstin: z.string().trim().toUpperCase().refine((v) => v === '' || isGstin(v), 'That does not look like a GSTIN').optional(),
  address: z.string().trim().max(300).optional(),
  stateCode: z.string().trim().refine((v) => v === '' || GST_STATES.some((s) => s.code === v), 'Choose a state from the list').optional(),
});
export type BuyerInput = z.infer<typeof buyerSchema>;

interface Breakdown {
  items?: { name: string; qty: number; rate: number; amt: number; sac?: string; gstRate?: number }[];
  subtotal?: number; cgst?: number; sgst?: number; igst?: number; gstRate?: number; total?: number;
  taxSummary?: { rate: number; taxable: number; tax: number }[];
}

const paise = (n: number | undefined) => Math.round((n ?? 0) * 100);
const rupees = (p: number) => p / 100;

/** Each tax group split into CGST + SGST (inside the state) or IGST (across states), in paise. */
function splitGroups(groups: { rate: number; taxablePaise: number; taxPaise: number }[], interState: boolean): TaxRow[] {
  return groups.map((g) => {
    const s = splitGst(g.taxPaise, interState);
    return { rate: g.rate, taxable: rupees(g.taxablePaise), cgst: rupees(s.cgstPaise), sgst: rupees(s.sgstPaise), igst: rupees(s.igstPaise) };
  });
}
const sumRows = (rows: TaxRow[], key: 'taxable' | 'cgst' | 'sgst' | 'igst') => rupees(rows.reduce((s, r) => s + paise(r[key]), 0));

export interface SnapshotInput {
  tenantName: string;
  settings: TaxSettings;
  property: { address?: string | null; phone?: string | null; email?: string | null } | null;
  guest: { name: string; email: string; phone?: string | null };
  room: { roomNumber: string };
  booking: { checkInDate: Date; checkOutDate: Date; numGuests?: number | null };
  nights: number;
  breakdown: Breakdown | null;
  billTotal: number;
  buyer: BuyerInput;
}

/** Throws an Error with a message safe to show when the buyer's GSTIN and state disagree. */
export function buildInvoiceSnapshot(i: SnapshotInput): InvoiceSnapshot {
  const { settings: s } = i;
  const b = i.buyer;

  let buyerState = b.stateCode ?? '';
  if (b.gstin) {
    const fromGstin = b.gstin.slice(0, 2);
    if (buyerState && buyerState !== fromGstin) {
      throw new Error(`The GSTIN starts with ${fromGstin} (${stateName(fromGstin) || 'unknown state'}), so the state must match it.`);
    }
    buyerState = fromGstin;
  }

  // Selling to a guest registered in another state is IGST. With no state given, the guest is treated as local.
  const interState = !!(buyerState && s.stateCode && buyerState !== s.stateCode);
  const bd = i.breakdown ?? {};
  const groups = taxGroups(bd as never).map((g) => ({ rate: g.rate, taxablePaise: paise(g.taxable), taxPaise: paise(g.tax) }));
  const taxes = splitGroups(groups, interState);
  const taxPaise = groups.reduce((sum, g) => sum + g.taxPaise, 0);
  const lines = (bd.items?.length ? bd.items : [{ name: `Room ${i.room.roomNumber}, ${i.nights} ${i.nights === 1 ? 'night' : 'nights'}`, qty: i.nights, rate: i.billTotal / i.nights, amt: i.billTotal }])
    .map((l) => ({ description: l.name, sac: l.sac ?? ROOM_SAC, qty: l.qty, rate: l.rate, taxable: l.amt, ...(l.gstRate !== undefined ? { gstRate: l.gstRate } : {}) }));

  const name = s.legalName || i.tenantName;
  const sellerState = s.stateCode;
  return {
    title: s.gstin && taxPaise > 0 ? 'Tax Invoice' : 'Invoice',
    seller: {
      name, gstin: s.gstin, address: s.address || i.property?.address || '', stateCode: sellerState, stateName: stateName(sellerState),
      phone: i.property?.phone ?? '', email: i.property?.email ?? '',
    },
    buyer: {
      name: b.name || i.guest.name, gstin: b.gstin ?? '', address: b.address ?? '', stateCode: buyerState, stateName: stateName(buyerState),
      email: i.guest.email, phone: i.guest.phone ?? '',
    },
    placeOfSupply: stateName(buyerState || sellerState),
    interState,
    stay: {
      roomNumber: i.room.roomNumber, checkIn: i.booking.checkInDate.toISOString(), checkOut: i.booking.checkOutDate.toISOString(),
      nights: i.nights, guests: i.booking.numGuests ?? null,
    },
    lines,
    taxes,
    taxable: sumRows(taxes, 'taxable'),
    cgst: sumRows(taxes, 'cgst'),
    sgst: sumRows(taxes, 'sgst'),
    igst: sumRows(taxes, 'igst'),
    total: i.billTotal,
    bankDetails: s.bankDetails,
    terms: s.terms,
  };
}

/** Old invoices have one rate and no `taxes` list: read them as one row so every invoice draws the same way. */
export function taxRowsOf(s: Pick<InvoiceSnapshot, 'taxable' | 'cgst' | 'sgst' | 'igst'> & { taxes?: TaxRow[]; gstRate?: number }): TaxRow[] {
  if (s.taxes?.length) return s.taxes;
  return s.cgst + s.sgst + s.igst > 0 ? [{ rate: s.gstRate ?? 0, taxable: s.taxable, cgst: s.cgst, sgst: s.sgst, igst: s.igst }] : [];
}

/* ───────── credit notes ───────── */

export interface CreditNoteSnapshot {
  seller: InvoiceSnapshot['seller'];
  buyer: InvoiceSnapshot['buyer'];
  placeOfSupply: string;
  interState: boolean;
  /** The invoice this corrects. */
  invoice: { number: string; date: string; total: number };
  reason: string;
  taxes: TaxRow[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** The whole credit, tax included. */
  total: number;
}

/**
 * Shares a credit across the invoice's tax rates in proportion to what each rate contributed, then takes the tax out of
 * each share. Crediting the whole invoice returns the invoice's own figures exactly (no stray paisa).
 */
export function allocateCredit(invoice: InvoiceSnapshot, amountPaise: number): TaxRow[] {
  const rows = taxRowsOf(invoice);
  const groups = rows.length ? rows : [{ rate: 0, taxable: invoice.total, cgst: 0, sgst: 0, igst: 0 }];
  const gross = groups.map((g) => paise(g.taxable) + paise(g.cgst) + paise(g.sgst) + paise(g.igst));
  const grossTotal = gross.reduce((a, b) => a + b, 0);
  if (amountPaise === grossTotal) return groups;

  let left = amountPaise;
  return groups.map((g, i) => {
    const share = i === groups.length - 1 ? left : Math.round((amountPaise * gross[i]) / grossTotal);
    left -= share;
    const taxable = g.rate > 0 ? Math.round(share / (1 + g.rate / 100)) : share;
    const s = splitGst(share - taxable, invoice.interState);
    return { rate: g.rate, taxable: rupees(taxable), cgst: rupees(s.cgstPaise), sgst: rupees(s.sgstPaise), igst: rupees(s.igstPaise) };
  });
}

export function buildCreditSnapshot(i: { invoice: InvoiceSnapshot; invoiceNumber: string; invoiceDate: Date; amountPaise: number; reason: string }): CreditNoteSnapshot {
  const taxes = allocateCredit(i.invoice, i.amountPaise);
  return {
    seller: i.invoice.seller,
    buyer: i.invoice.buyer,
    placeOfSupply: i.invoice.placeOfSupply,
    interState: i.invoice.interState,
    invoice: { number: i.invoiceNumber, date: i.invoiceDate.toISOString(), total: i.invoice.total },
    reason: i.reason,
    taxes,
    taxable: sumRows(taxes, 'taxable'),
    cgst: sumRows(taxes, 'cgst'),
    sgst: sumRows(taxes, 'sgst'),
    igst: sumRows(taxes, 'igst'),
    total: rupees(i.amountPaise),
  };
}

export interface CreditNoteDocument {
  id: string;
  number: string;
  issuedAt: string;
  billId: string;
  issuedBy: string | null;
  snapshot: CreditNoteSnapshot;
  totalInWords: string;
}

export function creditNoteDocument(i: { id: string; billId: string; number: string; issuedAt: Date; issuedBy: string | null; snapshot: CreditNoteSnapshot }): CreditNoteDocument {
  return { id: i.id, number: i.number, issuedAt: i.issuedAt.toISOString(), billId: i.billId, issuedBy: i.issuedBy, snapshot: i.snapshot, totalInWords: amountInWords(i.snapshot.total) };
}

/* ───────── the invoice as handed out ───────── */

export interface InvoiceDocument {
  number: string;
  issuedAt: string;
  billId: string;
  snapshot: InvoiceSnapshot;
  payments: { id: string; date: string; method: string; reference: string | null; amount: number }[];
  creditNotes: { id: string; number: string; issuedAt: string; reason: string; amount: number }[];
  /** Credit notes taken off the total. What the guest owes is total - credited - paid. */
  credited: number;
  paid: number;
  balance: number;
  /** Money the guest paid beyond what the invoice now comes to (after credit notes): to be given back by hand. */
  refundDue: number;
  totalInWords: string;
}

export function invoiceDocument(i: {
  billId: string; number: string; issuedAt: Date; snapshot: InvoiceSnapshot;
  payments: { id: string; createdAt: Date; method: string; reference: string | null; amount: string }[];
  creditNotes?: { id: string; number: string; issuedAt: Date; reason: string; amount: string }[];
}): InvoiceDocument {
  const payments = i.payments.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((p) => ({ id: p.id, date: p.createdAt.toISOString(), method: p.method, reference: p.reference, amount: Number(p.amount) }));
  const creditNotes = (i.creditNotes ?? []).slice().sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())
    .map((c) => ({ id: c.id, number: c.number, issuedAt: c.issuedAt.toISOString(), reason: c.reason, amount: Number(c.amount) }));
  const paid = rupees(payments.reduce((sum, p) => sum + paise(p.amount), 0));
  const credited = rupees(creditNotes.reduce((sum, c) => sum + paise(c.amount), 0));
  return {
    number: i.number,
    issuedAt: i.issuedAt.toISOString(),
    billId: i.billId,
    snapshot: i.snapshot,
    payments,
    creditNotes,
    credited,
    paid,
    balance: rupees(Math.max(0, paise(i.snapshot.total) - paise(credited) - paise(paid))),
    refundDue: rupees(Math.max(0, paise(paid) - (paise(i.snapshot.total) - paise(credited)))),
    totalInWords: amountInWords(i.snapshot.total),
  };
}
