import { beforeEach, describe, expect, it } from 'vitest';
import * as bookings from '@/app/api/bookings/route';
import * as bookingById from '@/app/api/bookings/[id]/route';
import * as taxApi from '@/app/api/settings/tax/route';
import * as invoiceApi from '@/app/api/billing/[id]/invoice/route';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
beforeEach(resetAndSeed);

const PROFILE = { legalName: 'Sunrise Stays Pvt Ltd', gstin: '29ABCDE1234F1Z5', stateCode: '29', address: '12 MG Road, Bengaluru', roomGst: 'slab', invoicePrefix: 'INV', bankDetails: 'HDFC 5020001234', terms: 'Check-out 11:00' };
const putTax = (body: unknown) => call(taxApi.PUT, 'PUT', '/api/settings/tax', { body });
const getTax = () => call(taxApi.GET, 'GET', '/api/settings/tax');
const issue = (billId: string, body?: unknown) => call(invoiceApi.POST, 'POST', `/api/billing/${billId}/invoice`, { params: { id: billId }, body });
const read = (billId: string) => call(invoiceApi.GET, 'GET', `/api/billing/${billId}/invoice`, { params: { id: billId } });

/** A staff booking in room A (5000 a night): 2 nights is 10000 before any tax. */
async function book(from: string, to: string, email = `${from}@guest.test`) {
  const r = await call(bookings.POST, 'POST', '/api/bookings', { body: { roomId: A.room, guestName: 'Stay Guest', guestEmail: email, checkInDate: from, checkOutDate: to } });
  expect(r.status).toBe(200);
  const [bill] = await q<{ id: string; total_amount: string; items_breakdown: any }>(`select id, total_amount, items_breakdown from bills where booking_id = '${r.json.booking.id}'`);
  return { bookingId: r.json.booking.id as string, bill };
}

describe('Settings > Tax & invoices', () => {
  it('starts with no GST, and only an owner or manager can change it', async () => {
    loginAs('frontA');
    expect((await getTax()).json).toMatchObject({ roomGst: 'none', gstin: '', invoicePrefix: 'INV' });
    expect((await putTax(PROFILE)).status).toBe(403);
    loginAs('managerA');
    expect((await putTax(PROFILE)).status).toBe(200);
    loginAs('waiterA');
    expect((await getTax()).status).toBe(403);
  });

  it('refuses a profile that charges GST without a GSTIN, or a state that does not match it', async () => {
    loginAs('ownerA');
    expect((await putTax({ roomGst: 'slab' })).status).toBe(400);
    expect((await putTax({ ...PROFILE, stateCode: '27' })).status).toBe(400);
    expect((await putTax({ ...PROFILE, gstin: 'bad' })).status).toBe(400);
    expect((await getTax()).json.roomGst).toBe('none'); // nothing was saved
  });

  it('is kept per hotel', async () => {
    loginAs('ownerA');
    await putTax(PROFILE);
    loginAs('ownerB');
    expect((await getTax()).json.gstin).toBe('');
  });
});

describe('the stay bill carries the tax', () => {
  it('with no GST profile the bill is the booking price, as before', async () => {
    loginAs('frontA');
    const { bill } = await book('2032-05-01', '2032-05-03');
    expect(bill.total_amount).toBe('10000.00');
    expect(bill.items_breakdown).toMatchObject({ subtotal: 10000, cgst: 0, sgst: 0, total: 10000 });
  });

  it('adds GST on top and shows nights, rate, CGST and SGST', async () => {
    loginAs('ownerA');
    await putTax(PROFILE);
    const { bill } = await book('2032-05-01', '2032-05-03');
    expect(bill.total_amount).toBe('10500.00');
    expect(bill.items_breakdown.items).toEqual([{ name: 'Room 101 (Type A), 2 nights', qty: 2, rate: 5000, amt: 10000, sac: '9963', gstRate: 5 }]);
    expect(bill.items_breakdown).toMatchObject({ subtotal: 10000, cgst: 250, sgst: 250, igst: 0, gstRate: 5, total: 10500 });
  });

  it('takes GST out when room prices already include it, so the guest still pays the listed price', async () => {
    loginAs('ownerA');
    await putTax({ ...PROFILE, ratesIncludeTax: true });
    const { bill } = await book('2032-05-01', '2032-05-03');
    expect(bill.total_amount).toBe('10000.00');
    expect(bill.items_breakdown).toMatchObject({ subtotal: 9523.81, cgst: 238.1, sgst: 238.09, gstRate: 5, total: 10000 });
  });

  it('a bill opened before the profile was saved keeps the tax it was opened with', async () => {
    loginAs('ownerA');
    const { bill } = await book('2032-05-01', '2032-05-03');
    await putTax(PROFILE);
    const [now] = await q<{ total_amount: string }>(`select total_amount from bills where id = '${bill.id}'`);
    expect(now.total_amount).toBe('10000.00');
  });

  it('confirming an online request opens its bill with the tax too', async () => {
    loginAs('ownerA');
    await putTax(PROFILE);
    await q(`update bookings set status = 'cancelled' where id = '${A.booking}'`);
    const id = '00000000-0000-4000-8000-000000000900';
    await q(`insert into bookings (id, tenant_id, property_id, room_id, guest_id, status, source, check_in_date, check_out_date, total_amount)
             values ('${id}', '${A.tenant}', '${A.property}', '${A.room}', '${A.guest}', 'pending', 'online', '2032-06-01T14:00:00Z', '2032-06-03T11:00:00Z', '10000.00')`);
    const r = await call(bookingById.PATCH, 'PATCH', `/api/bookings/${id}`, { params: { id }, body: { action: 'confirm' } });
    expect(r.status).toBe(200);
    const [bill] = await q<{ total_amount: string }>(`select total_amount from bills where booking_id = '${id}'`);
    expect(bill.total_amount).toBe('10500.00');
  });
});

describe('issuing an invoice', () => {
  it('numbers it PREFIX/FY/0001, and asking again returns the same invoice', async () => {
    loginAs('ownerA');
    await putTax(PROFILE);
    const { bill } = await book('2032-05-01', '2032-05-03');
    expect((await read(bill.id)).status).toBe(404); // nothing issued yet

    const first = await issue(bill.id);
    expect(first.status).toBe(201);
    expect(first.json.number).toMatch(/^INV\/\d\d-\d\d\/0001$/);
    expect(first.json.number.length).toBeLessThanOrEqual(16);
    expect(first.json.snapshot).toMatchObject({
      title: 'Tax Invoice', taxes: [{ rate: 5, taxable: 10000, cgst: 250, sgst: 250, igst: 0 }], taxable: 10000, cgst: 250, sgst: 250, igst: 0, total: 10500, interState: false,
      seller: { name: 'Sunrise Stays Pvt Ltd', gstin: '29ABCDE1234F1Z5', stateName: 'Karnataka' },
      buyer: { name: 'Stay Guest' }, placeOfSupply: 'Karnataka', stay: { roomNumber: '101', nights: 2 },
    });
    expect(first.json.totalInWords).toBe('Rupees Ten Thousand Five Hundred Only');
    expect(first.json.balance).toBe(10500);

    const again = await issue(bill.id);
    expect(again.status).toBe(200);
    expect(again.json.number).toBe(first.json.number);
    expect((await read(bill.id)).json.number).toBe(first.json.number);
    const [{ last }] = await q<{ last: number }>(`select last from invoice_counters where tenant_id = '${A.tenant}'`);
    expect(last).toBe(1); // asking twice did not use up a number
  });

  it('numbers run 1, 2, 3 with no gaps, even when several are issued at once, and each hotel counts its own', async () => {
    loginAs('ownerA');
    await putTax(PROFILE);
    const bills = [await book('2032-05-01', '2032-05-03'), await book('2032-05-03', '2032-05-05'), await book('2032-05-05', '2032-05-07')];
    const results = await Promise.all(bills.map((b) => issue(b.bill.id)));
    const seqs = results.map((r) => Number(r.json.number.split('/')[2])).sort();
    expect(seqs).toEqual([1, 2, 3]);

    // Hotel B's first invoice is also number 1.
    await q(`update bills set kind = 'stay', booking_id = '${B.booking}' where id = '${B.bill}'`);
    loginAs('ownerB');
    const b1 = await issue(B.bill);
    expect(b1.status).toBe(201);
    expect(b1.json.number.endsWith('/0001')).toBe(true);
  });

  it('charges IGST when the guest is registered in another state, and takes the state from their GSTIN', async () => {
    loginAs('ownerA');
    await putTax(PROFILE);
    const { bill } = await book('2032-05-01', '2032-05-03');
    const r = await issue(bill.id, { name: 'Acme Travels', gstin: '27AAPFU0939F1ZV', address: 'Mumbai' });
    expect(r.status).toBe(201);
    expect(r.json.snapshot).toMatchObject({ interState: true, cgst: 0, sgst: 0, igst: 500, placeOfSupply: 'Maharashtra', buyer: { name: 'Acme Travels', gstin: '27AAPFU0939F1ZV', stateCode: '27' } });
  });

  it('refuses a buyer GSTIN that disagrees with the state chosen, or that is malformed', async () => {
    loginAs('ownerA');
    await putTax(PROFILE);
    const { bill } = await book('2032-05-01', '2032-05-03');
    expect((await issue(bill.id, { gstin: '27AAPFU0939F1ZV', stateCode: '29' })).status).toBe(400);
    expect((await issue(bill.id, { gstin: '12345' })).status).toBe(400);
    expect((await read(bill.id)).status).toBe(404); // a refusal does not use a number
  });

  it('is frozen once issued: changing Settings later does not rewrite the invoice', async () => {
    loginAs('ownerA');
    await putTax(PROFILE);
    const { bill } = await book('2032-05-01', '2032-05-03');
    const first = await issue(bill.id);
    await putTax({ ...PROFILE, legalName: 'Renamed Hotels', address: 'Elsewhere', roomGst: 'none' });
    const now = await read(bill.id);
    expect(now.json.snapshot.seller).toMatchObject({ name: 'Sunrise Stays Pvt Ltd', address: '12 MG Road, Bengaluru' });
    expect(now.json.snapshot.total).toBe(first.json.snapshot.total);
  });

  it('shows payments as they stand now, so the balance falls as the guest pays', async () => {
    loginAs('ownerA');
    await putTax(PROFILE);
    const { bill } = await book('2032-05-01', '2032-05-03');
    await issue(bill.id);
    await q(`update bills set paid_amount = '3000.00', status = 'partial' where id = '${bill.id}'`);
    await q(`insert into payments (tenant_id, bill_id, amount, method, reference) values ('${A.tenant}', '${bill.id}', '3000.00', 'upi', 'UTR123')`);
    const doc = (await read(bill.id)).json;
    expect(doc).toMatchObject({ paid: 3000, balance: 7500 });
    expect(doc.payments).toMatchObject([{ method: 'upi', reference: 'UTR123', amount: 3000 }]);
  });

  it('without a GSTIN it is a plain invoice with no tax lines', async () => {
    loginAs('ownerA');
    const { bill } = await book('2032-05-01', '2032-05-03');
    const r = await issue(bill.id);
    expect(r.json.snapshot).toMatchObject({ title: 'Invoice', taxable: 10000, cgst: 0, sgst: 0, igst: 0, total: 10000 });
  });

  it('is only for live stay bills, and only for the people who work the front desk', async () => {
    loginAs('ownerA');
    const { bookingId, bill } = await book('2032-05-01', '2032-05-03');
    expect((await issue(A.bill)).status).toBe(409); // a restaurant bill
    loginAs('waiterA');
    expect((await issue(bill.id)).status).toBe(403);
    expect((await read(bill.id)).status).toBe(403);
    loginAs('frontA');
    await call(bookingById.PATCH, 'PATCH', `/api/bookings/${bookingId}`, { params: { id: bookingId }, body: { action: 'cancel' } });
    expect((await issue(bill.id)).status).toBe(409); // voided with the booking
    expect((await issue('not-a-uuid')).status).toBe(404);
  });

  it('another hotel cannot see or issue it', async () => {
    loginAs('ownerA');
    const { bill } = await book('2032-05-01', '2032-05-03');
    await issue(bill.id);
    loginAs('ownerB');
    expect((await read(bill.id)).status).toBe(404);
    expect((await issue(bill.id)).status).toBe(404);
  });

  it('the database itself refuses a half-stamped invoice and a repeated number', async () => {
    loginAs('ownerA');
    const x = await book('2032-05-01', '2032-05-03');
    const y = await book('2032-05-03', '2032-05-05');
    const bad = async (sql: string) => { try { await q(sql); return ''; } catch (e) { return String((e as Error).message + JSON.stringify((e as { cause?: unknown }).cause ?? '')); } };
    expect(await bad(`update bills set invoice_number = 'X/1' where id = '${x.bill.id}'`)).toContain('bills_invoice_complete_check');
    await q(`update bills set invoice_number = 'X/1', invoice_issued_at = now(), invoice_data = '{}' where id = '${x.bill.id}'`);
    expect(await bad(`update bills set invoice_number = 'X/1', invoice_issued_at = now(), invoice_data = '{}' where id = '${y.bill.id}'`)).toContain('bills_invoice_number_uq');
  });
});
