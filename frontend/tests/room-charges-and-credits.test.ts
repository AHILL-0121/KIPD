import { beforeEach, describe, expect, it } from 'vitest';
import * as bookings from '@/app/api/bookings/route';
import * as bookingById from '@/app/api/bookings/[id]/route';
import * as taxApi from '@/app/api/settings/tax/route';
import * as invoiceApi from '@/app/api/billing/[id]/invoice/route';
import * as postApi from '@/app/api/billing/[id]/post-to-room/route';
import * as creditApi from '@/app/api/billing/[id]/credit-notes/route';
import * as creditOne from '@/app/api/credit-notes/[id]/route';
import * as billing from '@/app/api/billing/route';
import { allocateCredit, buildCreditSnapshot, type InvoiceSnapshot } from '@/lib/invoice';
import { taxGroups } from '@/lib/gst';
import { postCharges, restaurantRate } from '@/lib/stay-bill';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
beforeEach(resetAndSeed);

const PROFILE = { legalName: 'Sunrise Stays Pvt Ltd', gstin: '29ABCDE1234F1Z5', stateCode: '29', address: '12 MG Road', roomGst: 'slab', invoicePrefix: 'INV' };

/* ───────── the maths ───────── */
describe('posting restaurant charges onto a stay bill, in paise', () => {
  const room = { items: [{ name: 'Room 101, 2 nights', qty: 2, rate: 5000, amt: 10000, sac: '9963', gstRate: 5 }], subtotal: 10000, cgst: 250, sgst: 250, igst: 0, gstRate: 5, total: 10500, taxSummary: [{ rate: 5, taxable: 10000, tax: 500 }] };
  const food = [{ name: 'Masala dosa', qty: 2, rate: 120, amt: 240 }, { name: 'Filter coffee', qty: 2, rate: 60, amt: 120 }];
  const at = new Date('2032-05-02T10:00:00Z');

  it('keeps room and food GST as separate rates when they differ', () => {
    const { breakdown, totalPaise } = postCharges(room, { items: food, ratePercent: 18, billId: 'b1', by: 'Front A', at });
    expect(breakdown.taxSummary).toEqual([{ rate: 5, taxable: 10000, tax: 500 }, { rate: 18, taxable: 360, tax: 64.8 }]);
    expect(totalPaise).toBe(1092480);
    expect(breakdown.total).toBe(10924.8);
    expect(breakdown.cgst + breakdown.sgst).toBeCloseTo(564.8, 5);
    expect(breakdown.items.slice(1)).toMatchObject([{ name: 'Restaurant: Masala dosa', sac: '996331', gstRate: 18 }, { name: 'Restaurant: Filter coffee' }]);
    expect(breakdown.postings).toEqual([{ billId: 'b1', at: at.toISOString(), by: 'Front A', amount: 424.8 }]);
  });

  it('adds into the same group when the rate is the same', () => {
    const { breakdown } = postCharges(room, { items: food, ratePercent: 5, billId: 'b1', by: 'x', at });
    expect(breakdown.taxSummary).toEqual([{ rate: 5, taxable: 10360, tax: 518 }]);
    expect(breakdown.total).toBe(10878);
  });

  it('works on a stay opened with no GST at all', () => {
    const plain = { items: [{ name: 'Room', qty: 1, rate: 3000, amt: 3000 }], subtotal: 3000, cgst: 0, sgst: 0, total: 3000 };
    const { breakdown, totalPaise } = postCharges(plain, { items: food, ratePercent: 5, billId: 'b1', by: 'x', at });
    expect(breakdown.taxSummary).toEqual([{ rate: 0, taxable: 3000, tax: 0 }, { rate: 5, taxable: 360, tax: 18 }]);
    expect(totalPaise).toBe(337800);
  });

  it('reads the food rate off the restaurant bill, and old stay bills as one group', () => {
    expect(restaurantRate({ subtotal: 360, cgst: 9, sgst: 9 })).toBe(5);
    expect(restaurantRate({ subtotal: 360, cgst: 32.4, sgst: 32.4 })).toBe(18);
    expect(restaurantRate({ subtotal: 0, cgst: 0, sgst: 0 })).toBe(0);
    expect(taxGroups({ subtotal: 10000, cgst: 250, sgst: 250, gstRate: 5, total: 10500 })).toEqual([{ rate: 5, taxable: 10000, tax: 500 }]);
  });
});

describe('sharing a credit across tax rates', () => {
  const invoice = {
    interState: false, total: 10924.8, taxable: 10360, cgst: 282.4, sgst: 282.4, igst: 0,
    taxes: [{ rate: 5, taxable: 10000, cgst: 250, sgst: 250, igst: 0 }, { rate: 18, taxable: 360, cgst: 32.4, sgst: 32.4, igst: 0 }],
  } as unknown as InvoiceSnapshot;
  const sum = (rows: { taxable: number; cgst: number; sgst: number; igst: number }[]) => Math.round(rows.reduce((s, r) => s + r.taxable + r.cgst + r.sgst + r.igst, 0) * 100);

  it('crediting the whole invoice gives back the invoice figures exactly', () => {
    expect(allocateCredit(invoice, 1092480)).toEqual(invoice.taxes);
  });

  it('a part credit always adds up to exactly the amount, whatever the split', () => {
    for (const amount of [1, 99, 100, 12345, 500000, 1092479]) {
      expect(sum(allocateCredit(invoice, amount))).toBe(amount);
    }
  });

  it('is all IGST for an interstate invoice, and the snapshot names the invoice it corrects', () => {
    const inter = { ...invoice, interState: true } as InvoiceSnapshot;
    const rows = allocateCredit(inter, 500000);
    expect(rows.every((r) => r.cgst === 0 && r.sgst === 0)).toBe(true);
    const snap = buildCreditSnapshot({ invoice: inter, invoiceNumber: 'INV/26-27/0001', invoiceDate: new Date('2032-05-01'), amountPaise: 500000, reason: 'Rate fixed' });
    expect(snap).toMatchObject({ total: 5000, invoice: { number: 'INV/26-27/0001', total: 10924.8 }, reason: 'Rate fixed' });
    expect(Math.round(snap.taxable * 100) + Math.round(snap.igst * 100)).toBe(500000);
  });
});

/* ───────── through the real routes ───────── */
const putTax = (body: unknown) => call(taxApi.PUT, 'PUT', '/api/settings/tax', { body });
const issue = (billId: string, body?: unknown) => call(invoiceApi.POST, 'POST', `/api/billing/${billId}/invoice`, { params: { id: billId }, body });
const readInvoice = (billId: string) => call(invoiceApi.GET, 'GET', `/api/billing/${billId}/invoice`, { params: { id: billId } });
const post = (foodBillId: string, stayBillId: string) => call(postApi.POST, 'POST', `/api/billing/${foodBillId}/post-to-room`, { params: { id: foodBillId }, body: { stayBillId } });
const credit = (billId: string, body: unknown) => call(creditApi.POST, 'POST', `/api/billing/${billId}/credit-notes`, { params: { id: billId }, body });
const act = (bookingId: string, action: string) => call(bookingById.PATCH, 'PATCH', `/api/bookings/${bookingId}`, { params: { id: bookingId }, body: { action } });

type BillRow = { id: string; status: string; total_amount: string; paid_amount: string; posted_to_bill_id: string | null; items_breakdown: any };
const row = async (id: string) => (await q<BillRow>(`select * from bills where id = '${id}'`))[0];

/** A guest who is checked in: 2 nights in room A at 5000 = 10000, plus 5% room GST = 10500. */
async function checkedInStay(from = '2032-05-01', to = '2032-05-03', gst = true) {
  loginAs('ownerA');
  if (gst) await putTax(PROFILE);
  const r = await call(bookings.POST, 'POST', '/api/bookings', { body: { roomId: A.room, guestName: 'Stay Guest', guestEmail: `${from}@guest.test`, checkInDate: from, checkOutDate: to } });
  expect(r.status).toBe(200);
  const bookingId = r.json.booking.id as string;
  // One guest per room: an earlier test guest has left before this one arrives.
  await q(`update bookings set status = 'checked_out' where room_id = '${A.room}' and status = 'checked_in'`);
  expect((await act(bookingId, 'check-in')).status).toBe(200);
  const [bill] = await q<{ id: string }>(`select id from bills where booking_id = '${bookingId}'`);
  return { bookingId, stayBillId: bill.id };
}

/** The seeded restaurant bill with real lines: 360 of food at the given GST (cgst + sgst each half of it). */
async function foodBill(gstPercent = 5) {
  const tax = (360 * gstPercent) / 100;
  const total = 360 + tax;
  await q(`update bills set total_amount = '${total.toFixed(2)}', items_breakdown = '${JSON.stringify({
    items: [{ name: 'Masala dosa', qty: 2, rate: 120, amt: 240 }, { name: 'Filter coffee', qty: 2, rate: 60, amt: 120 }],
    subtotal: 360, cgst: tax / 2, sgst: tax / 2, total,
  })}' where id = '${A.bill}'`);
  return A.bill;
}

describe('charging a restaurant bill to a room', () => {
  it('moves the lines onto the stay bill at their own GST rate, and closes the restaurant bill as posted', async () => {
    const { stayBillId } = await checkedInStay();
    const food = await foodBill(18);
    const r = await post(food, stayBillId);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ posted: 424.8, stayTotal: 10924.8 });

    const stay = await row(stayBillId);
    expect(stay).toMatchObject({ status: 'open', total_amount: '10924.80' });
    expect(stay.items_breakdown.taxSummary).toEqual([{ rate: 5, taxable: 10000, tax: 500 }, { rate: 18, taxable: 360, tax: 64.8 }]);
    expect(stay.items_breakdown.items.map((i: { name: string }) => i.name)).toEqual(['Room 101 (Type A), 2 nights', 'Restaurant: Masala dosa', 'Restaurant: Filter coffee']);
    expect(await row(food)).toMatchObject({ status: 'posted', posted_to_bill_id: stayBillId });
  });

  it('shows up on the invoice with each rate on its own tax line, and as IGST across states', async () => {
    const { stayBillId } = await checkedInStay();
    await post(await foodBill(18), stayBillId);
    const inv = await issue(stayBillId);
    expect(inv.json.snapshot.taxes).toEqual([
      { rate: 5, taxable: 10000, cgst: 250, sgst: 250, igst: 0 },
      { rate: 18, taxable: 360, cgst: 32.4, sgst: 32.4, igst: 0 },
    ]);
    expect(inv.json.snapshot).toMatchObject({ taxable: 10360, cgst: 282.4, sgst: 282.4, total: 10924.8 });
    expect(inv.json.snapshot.lines.find((l: { sac: string }) => l.sac === '996331')).toMatchObject({ description: 'Restaurant: Masala dosa', gstRate: 18 });

    const second = await checkedInStay('2032-06-01', '2032-06-03');
    await q(`update bills set status = 'open', posted_to_bill_id = null where id = '${A.bill}'`); // free the seeded bill for a second posting
    await post(await foodBill(18), second.stayBillId);
    const inter = await issue(second.stayBillId, { gstin: '27AAPFU0939F1ZV' });
    expect(inter.json.snapshot.taxes).toEqual([
      { rate: 5, taxable: 10000, cgst: 0, sgst: 0, igst: 500 },
      { rate: 18, taxable: 360, cgst: 0, sgst: 0, igst: 64.8 },
    ]);
  });

  it('reopens a stay bill that was already paid in full, as part paid', async () => {
    const { stayBillId } = await checkedInStay();
    await q(`update bills set paid_amount = '10500.00', status = 'paid', settled_at = now() where id = '${stayBillId}'`);
    expect((await post(await foodBill(5), stayBillId)).status).toBe(200);
    expect(await row(stayBillId)).toMatchObject({ status: 'partial', total_amount: '10878.00', paid_amount: '10500.00' });
  });

  it('refuses, and writes nothing, when it should not happen', async () => {
    const { stayBillId, bookingId } = await checkedInStay();
    const food = await foodBill(5);
    const before = JSON.stringify(await row(stayBillId));

    // the same restaurant bill twice
    expect((await post(food, stayBillId)).status).toBe(200);
    const again = await post(food, stayBillId);
    expect(again.status).toBe(409);
    expect(again.json.error).toMatch(/already been charged/);

    // not a stay bill / not a restaurant bill / a restaurant bill that has been paid
    await q(`update bills set status = 'open', posted_to_bill_id = null where id = '${food}'`);
    expect((await post(food, food)).status).toBe(409);
    expect((await post(stayBillId, stayBillId)).status).toBe(409);
    await q(`update bills set paid_amount = '10', status = 'partial' where id = '${food}'`);
    expect((await post(food, stayBillId)).status).toBe(409);
    await q(`update bills set paid_amount = '0', status = 'open' where id = '${food}'`);

    // a guest who is not checked in
    await q(`update bookings set status = 'confirmed' where id = '${bookingId}'`);
    expect((await post(food, stayBillId)).json.error).toMatch(/checked in/);
    await q(`update bookings set status = 'checked_in' where id = '${bookingId}'`);

    // the stay has been invoiced
    await q(`update bills set status = 'open', posted_to_bill_id = null where id = '${food}'`);
    await q(`update bills set total_amount = '10500.00' where id = '${stayBillId}'`);
    await issue(stayBillId);
    const late = await post(food, stayBillId);
    expect(late.status).toBe(409);
    expect(late.json.error).toMatch(/already been issued/);
    expect((await row(food)).status).toBe('open');
    expect(before).not.toBe(''); // (the first, allowed posting changed the stay; the refusals after it changed nothing)
  });

  it('is only for the front desk, only within the hotel, and the posted bill cannot then be paid', async () => {
    const { stayBillId } = await checkedInStay();
    const food = await foodBill(5);
    loginAs('waiterA');
    expect((await post(food, stayBillId)).status).toBe(403);
    loginAs('ownerB');
    expect((await post(food, stayBillId)).status).toBe(404);
    loginAs('frontA');
    expect((await post(food, stayBillId)).status).toBe(200);
    const paid = await call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId: food, paymentMethod: 'cash' } });
    expect(paid.status).toBe(409);
    expect(await row(food)).toMatchObject({ status: 'posted', paid_amount: '0.00' });
  });

  it('the database will not hold a posted bill without its stay, or a stay link without the posted status', async () => {
    const bad = async (sql: string) => { try { await q(sql); return ''; } catch (e) { return String((e as Error).message + JSON.stringify((e as { cause?: unknown }).cause ?? '')); } };
    expect(await bad(`update bills set status = 'posted' where id = '${A.bill}'`)).toContain('bills_posted_check');
    const { stayBillId } = await checkedInStay();
    expect(await bad(`update bills set posted_to_bill_id = '${stayBillId}' where id = '${A.bill}'`)).toContain('bills_posted_check');
    expect(await bad(`update bills set status = 'posted', posted_to_bill_id = '${B.bill}' where id = '${A.bill}'`)).toContain('fk_bills_posted_to'); // another hotel's bill
  });
});

describe('credit notes', () => {
  it('a part credit takes the next CN number, lowers the bill, and splits the tax out of what is credited', async () => {
    const { stayBillId } = await checkedInStay();
    const inv = await issue(stayBillId);
    expect(inv.json.number).toMatch(/\/0001$/);

    const r = await credit(stayBillId, { amount: 1050, reason: 'Rate corrected' });
    expect(r.status).toBe(201);
    expect(r.json.number).toMatch(/^CN\/\d\d-\d\d\/0001$/); // its own series: invoice 0001 and credit note 0001
    expect(r.json.snapshot).toMatchObject({
      total: 1050, taxable: 1000, cgst: 25, sgst: 25, igst: 0, reason: 'Rate corrected',
      invoice: { number: inv.json.number, total: 10500 }, buyer: { name: 'Stay Guest' }, seller: { gstin: '29ABCDE1234F1Z5' },
    });
    expect(r.json.totalInWords).toBe('Rupees One Thousand Fifty Only');
    expect(await row(stayBillId)).toMatchObject({ total_amount: '9450.00', status: 'open' });

    // the invoice now shows the credit and what is still owed
    await q(`update bills set paid_amount = '3000.00', status = 'partial' where id = '${stayBillId}'`);
    await q(`insert into payments (tenant_id, bill_id, amount, method) values ('${A.tenant}', '${stayBillId}', '3000.00', 'cash')`);
    const doc = (await readInvoice(stayBillId)).json;
    expect(doc).toMatchObject({ credited: 1050, paid: 3000, balance: 6450, refundDue: 0 });
    expect(doc.creditNotes).toMatchObject([{ number: r.json.number, reason: 'Rate corrected', amount: 1050 }]);
  });

  it('crediting everything left zeroes the bill and closes it; numbers run 1, 2 with no gaps', async () => {
    const { stayBillId } = await checkedInStay();
    await issue(stayBillId);
    const first = await credit(stayBillId, { amount: 500, reason: 'Goodwill' });
    const rest = await credit(stayBillId, { full: true, reason: 'Stay cancelled' });
    expect(first.json.number.endsWith('/0001')).toBe(true);
    expect(rest.json.number.endsWith('/0002')).toBe(true);
    expect(rest.json.snapshot.total).toBe(10000);
    expect(await row(stayBillId)).toMatchObject({ total_amount: '0.00', status: 'paid' });
    const again = await credit(stayBillId, { full: true, reason: 'Again' });
    expect(again.status).toBe(409);
    expect(again.json.error).toMatch(/credited in full/);
  });

  it('crediting a whole multi-rate invoice reproduces its tax lines exactly', async () => {
    const { stayBillId } = await checkedInStay();
    await post(await foodBill(18), stayBillId);
    const inv = await issue(stayBillId);
    const r = await credit(stayBillId, { full: true, reason: 'Stay cancelled' });
    expect(r.json.snapshot.taxes).toEqual(inv.json.snapshot.taxes);
    expect(r.json.snapshot.total).toBe(inv.json.snapshot.total);
  });

  it('cannot take a live bill below what has been paid, and says what to do when it is paid in full', async () => {
    const { stayBillId } = await checkedInStay();
    await issue(stayBillId);
    await q(`update bills set paid_amount = '3000.00', status = 'partial' where id = '${stayBillId}'`);
    const over = await credit(stayBillId, { amount: 8000, reason: 'Too much' });
    expect(over.status).toBe(409);
    expect(over.json.error).toMatch(/7,500 of this bill is still unpaid/);
    expect((await credit(stayBillId, { amount: 7500, reason: 'Exactly the unpaid part' })).status).toBe(201);
    expect(await row(stayBillId)).toMatchObject({ total_amount: '3000.00', paid_amount: '3000.00', status: 'paid' });

    const full = await checkedInStay('2032-06-01', '2032-06-03');
    await issue(full.stayBillId);
    await q(`update bills set paid_amount = '10500.00', status = 'paid' where id = '${full.stayBillId}'`);
    const refund = await credit(full.stayBillId, { amount: 100, reason: 'Small' });
    expect(refund.status).toBe(409);
    expect(refund.json.error).toMatch(/paid in full/);
  });

  it('never more than the invoice, and never without a reason, an invoice, or a sensible amount', async () => {
    const { stayBillId } = await checkedInStay();
    expect((await credit(stayBillId, { amount: 100, reason: 'No invoice yet' })).status).toBe(409);
    await issue(stayBillId);
    expect((await credit(stayBillId, { amount: 10500.01, reason: 'More than the invoice' })).status).toBe(409);
    expect((await credit(stayBillId, { amount: 100, reason: '' })).status).toBe(400);
    expect((await credit(stayBillId, { reason: 'No amount' })).status).toBe(400);
    expect((await credit(stayBillId, { amount: 0, reason: 'Zero' })).status).toBe(400);
    expect((await credit(stayBillId, { amount: 1.234, reason: 'Fractions of a paisa' })).status).toBe(400);
    expect(await row(stayBillId)).toMatchObject({ total_amount: '10500.00' });
    const [{ n }] = await q<{ n: string }>(`select count(*)::text as n from credit_notes`);
    expect(n).toBe('0'); // none of the refusals used up a number
  });

  it('a stay cancelled after invoicing can be credited in full, and the invoice then shows the refund due', async () => {
    const { stayBillId, bookingId } = await checkedInStay();
    await issue(stayBillId);
    await q(`update bills set paid_amount = '3000.00', status = 'partial' where id = '${stayBillId}'`);
    await q(`insert into payments (tenant_id, bill_id, amount, method) values ('${A.tenant}', '${stayBillId}', '3000.00', 'upi')`);
    loginAs('frontA');
    expect((await act(bookingId, 'cancel')).status).toBe(200);
    expect((await row(stayBillId)).status).toBe('void');

    const r = await credit(stayBillId, { full: true, reason: 'Booking cancelled' });
    expect(r.status).toBe(201);
    expect(await row(stayBillId)).toMatchObject({ status: 'void', total_amount: '10500.00' }); // a void bill is left as it is
    const doc = (await readInvoice(stayBillId)).json;
    expect(doc).toMatchObject({ credited: 10500, paid: 3000, balance: 0, refundDue: 3000 });

    // the booking list still points at the invoice, so it can be opened
    const list = await call(bookings.GET, 'GET', '/api/bookings');
    expect(list.json.find((b: { id: string }) => b.id === bookingId)).toMatchObject({ bill: null, invoice: { billId: stayBillId } });
  });

  it('lists a bill\'s credit notes and opens one, only for the front desk of the same hotel', async () => {
    const { stayBillId } = await checkedInStay();
    await issue(stayBillId);
    const made = await credit(stayBillId, { amount: 100, reason: 'Minibar removed' });
    const list = await call(creditApi.GET, 'GET', `/api/billing/${stayBillId}/credit-notes`, { params: { id: stayBillId } });
    expect(list.json.map((c: { number: string }) => c.number)).toEqual([made.json.number]);
    const one = await call(creditOne.GET, 'GET', `/api/credit-notes/${made.json.id}`, { params: { id: made.json.id } });
    expect(one.status).toBe(200);
    expect(one.json.snapshot.reason).toBe('Minibar removed');

    loginAs('waiterA');
    expect((await credit(stayBillId, { amount: 10, reason: 'Not allowed' })).status).toBe(403);
    loginAs('ownerB');
    expect((await credit(stayBillId, { amount: 10, reason: 'Other hotel' })).status).toBe(404);
    expect((await call(creditOne.GET, 'GET', `/api/credit-notes/${made.json.id}`, { params: { id: made.json.id } })).status).toBe(404);
    expect((await call(creditOne.GET, 'GET', '/api/credit-notes/nope', { params: { id: 'nope' } })).status).toBe(404);
  });

  it('is frozen: later Settings changes do not alter an issued credit note', async () => {
    const { stayBillId } = await checkedInStay();
    await issue(stayBillId);
    const made = await credit(stayBillId, { amount: 100, reason: 'Fix' });
    await putTax({ ...PROFILE, legalName: 'Renamed Hotels', roomGst: 'none' });
    const one = await call(creditOne.GET, 'GET', `/api/credit-notes/${made.json.id}`, { params: { id: made.json.id } });
    expect(one.json.snapshot.seller.name).toBe('Sunrise Stays Pvt Ltd');
  });

  it('the database refuses a credit of nothing, and a repeated number', async () => {
    const bad = async (sql: string) => { try { await q(sql); return ''; } catch (e) { return String((e as Error).message + JSON.stringify((e as { cause?: unknown }).cause ?? '')); } };
    const { stayBillId } = await checkedInStay();
    const ins = (n: string, amt: string) => `insert into credit_notes (tenant_id, bill_id, number, seq, amount, reason, data) values ('${A.tenant}', '${stayBillId}', '${n}', 1, '${amt}', 'r', '{}')`;
    expect(await bad(ins('CN/1', '0'))).toContain('credit_notes_amount_check');
    await q(ins('CN/1', '5'));
    expect(await bad(ins('CN/1', '5'))).toContain('credit_notes_number_uq');
    expect(await bad(`insert into credit_notes (tenant_id, bill_id, number, seq, amount, reason, data) values ('${A.tenant}', '${B.bill}', 'CN/2', 2, '5', 'r', '{}')`)).toContain('fk_credit_notes_bill'); // another hotel's bill
  });
});
