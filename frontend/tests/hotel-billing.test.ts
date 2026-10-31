import { beforeEach, describe, expect, it } from 'vitest';
import * as bookings from '@/app/api/bookings/route';
import * as bookingById from '@/app/api/bookings/[id]/route';
import * as billing from '@/app/api/billing/route';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(resetAndSeed);

/** A staff booking: room A costs 5000 a night, so 2032-05-01 to 2032-05-03 is 2 nights = 10000. */
async function book(from = '2032-05-01', to = '2032-05-03', email = 'stay@guest.test') {
  const r = await call(bookings.POST, 'POST', '/api/bookings', { body: { roomId: A.room, guestName: 'Stay Guest', guestEmail: email, checkInDate: from, checkOutDate: to } });
  expect(r.status).toBe(200);
  return r.json.booking.id as string;
}
const act = (id: string, action: string) => call(bookingById.PATCH, 'PATCH', `/api/bookings/${id}`, { params: { id }, body: { action } });
const pay = (billId: string, body: Record<string, unknown> = {}) => call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId, ...body } });
const stayBills = (bookingId: string) => q<{ id: string; kind: string; status: string; total_amount: string; paid_amount: string; items_breakdown: { items: { name: string; qty: number; rate: number; amt: number }[]; total: number } }>(`select * from bills where booking_id = '${bookingId}' order by created_at`);

describe('a stay bill opens with the booking', () => {
  it('a booking made by staff opens one unpaid bill: room, type and nights as one line, priced like the booking', async () => {
    loginAs('frontA');
    const id = await book();
    const [bill, ...rest] = await stayBills(id);
    expect(rest).toEqual([]);
    expect(bill).toMatchObject({ kind: 'stay', status: 'open', total_amount: '10000.00', paid_amount: '0.00' });
    expect(bill.items_breakdown.items).toEqual([{ name: 'Room 101 (Type A), 2 nights', qty: 2, rate: 5000, amt: 10000 }]);
    expect(bill.items_breakdown.total).toBe(10000);
  });

  it('a pending request has no bill until it is confirmed, and confirming twice does not bill twice', async () => {
    loginAs('frontA');
    await q(`update bookings set status = 'cancelled' where id = '${A.booking}'`);
    const pendingId = uuid(800);
    await q(`insert into bookings (id, tenant_id, property_id, room_id, guest_id, status, source, check_in_date, check_out_date, total_amount)
             values ('${pendingId}', '${A.tenant}', '${A.property}', '${A.room}', '${A.guest}', 'pending', 'online', '2032-06-01T14:00:00Z', '2032-06-04T11:00:00Z', '15000.00')`);
    expect(await stayBills(pendingId)).toHaveLength(0);

    expect((await act(pendingId, 'confirm')).status).toBe(200);
    const [bill] = await stayBills(pendingId);
    expect(bill).toMatchObject({ kind: 'stay', status: 'open', total_amount: '15000.00' });
    expect(bill.items_breakdown.items[0].name).toBe('Room 101 (Type A), 3 nights');

    expect((await act(pendingId, 'confirm')).status).toBe(409); // already confirmed
    expect(await stayBills(pendingId)).toHaveLength(1);
  });

  it('checking in a booking that never had a bill opens one, and never a second', async () => {
    loginAs('frontA');
    // the seeded booking was inserted directly, so it has no bill
    expect(await stayBills(A.booking)).toHaveLength(0);
    expect((await act(A.booking, 'check-in')).status).toBe(200);
    expect(await stayBills(A.booking)).toHaveLength(1);
    expect((await act(A.booking, 'check-in')).status).toBe(200);
    expect(await stayBills(A.booking)).toHaveLength(1);
  });

  it('the database allows only one live stay bill per booking', async () => {
    loginAs('frontA');
    const id = await book();
    await expect(q(`insert into bills (tenant_id, booking_id, kind, guest_id, total_amount) select tenant_id, booking_id, 'stay', guest_id, 1 from bills where booking_id = '${id}'`))
      .rejects.toThrow();
    // a voided bill does not count, so a re-confirmed booking can be billed again
    await q(`update bills set status = 'void' where booking_id = '${id}'`);
    await q(`insert into bills (tenant_id, booking_id, kind, guest_id, total_amount) select tenant_id, booking_id, 'stay', guest_id, 1 from bills where booking_id = '${id}'`);
  });
});

describe('cancelling a booking', () => {
  it('voids its bill, and the bill leaves the billing list', async () => {
    loginAs('frontA');
    const id = await book();
    const r = await act(id, 'cancel');
    expect(r.status).toBe(200);
    expect(r.json.refundDue).toBeUndefined(); // nothing was paid
    expect((await stayBills(id))[0].status).toBe('void');
    const list = await call(billing.GET, 'GET', '/api/billing?kind=stay');
    expect(list.json.map((b: { id: string }) => b.id)).toEqual([]);
  });

  it('says how much was already paid, keeps the payments, and refuses further payments on the voided bill', async () => {
    loginAs('frontA');
    const id = await book();
    const [bill] = await stayBills(id);
    expect((await pay(bill.id, { amount: 2000, paymentMethod: 'upi', reference: 'UTR123' })).status).toBe(200);

    const r = await act(id, 'cancel');
    expect(r.json).toEqual({ success: true, refundDue: 2000 });
    expect((await stayBills(id))[0]).toMatchObject({ status: 'void', paid_amount: '2000.00' });
    expect(await q(`select amount from payments where bill_id = '${bill.id}'`)).toEqual([{ amount: '2000.00' }]); // the record stays
    const again = await pay(bill.id, { amount: 100 });
    expect(again.status).toBe(409);
    expect(again.json.error).toMatch(/cancelled/);
  });

  it('a restaurant bill is untouched by cancelling a booking', async () => {
    loginAs('frontA');
    await act(A.booking, 'cancel');
    expect(await q(`select status from bills where id = '${A.bill}'`)).toEqual([{ status: 'open' }]);
  });
});

describe('recording payments', () => {
  it('a part payment leaves the bill partial; paying the rest (no amount given) closes it', async () => {
    loginAs('ownerA');
    const [bill] = await stayBills(await book());

    const first = await pay(bill.id, { amount: 3000, paymentMethod: 'upi', reference: 'UTR9876', note: 'Deposit' });
    expect(first.status).toBe(200);
    expect(first.json.bill).toMatchObject({ status: 'partial', paidAmount: 3000, totalAmount: 10000 });
    expect(await q(`select status, paid_amount, settled_at from bills where id = '${bill.id}'`)).toEqual([{ status: 'partial', paid_amount: '3000.00', settled_at: null }]);
    expect(await q(`select amount, method, reference, note, received_by, received_by_user_id from payments where bill_id = '${bill.id}'`)).toEqual([
      { amount: '3000.00', method: 'upi', reference: 'UTR9876', note: 'Deposit', received_by: 'Owner A', received_by_user_id: 'user_ownerA' },
    ]);

    const rest = await pay(bill.id, { paymentMethod: 'cash' });
    expect(rest.status).toBe(200);
    expect(rest.json.bill).toMatchObject({ status: 'paid', paidAmount: 10000 });
    const [done] = await q<{ status: string; paid_amount: string; settled_at: Date | null }>(`select status, paid_amount, settled_at from bills where id = '${bill.id}'`);
    expect(done).toMatchObject({ status: 'paid', paid_amount: '10000.00' });
    expect(done.settled_at).not.toBeNull();
    expect(await q(`select amount from payments where bill_id = '${bill.id}' order by amount`)).toEqual([{ amount: '3000.00' }, { amount: '7000.00' }]);

    expect((await pay(bill.id)).status).toBe(409); // already paid
  });

  it('refuses more than is owed, with the amount still owed, and writes nothing', async () => {
    loginAs('ownerA');
    const [bill] = await stayBills(await book());
    await pay(bill.id, { amount: 4000 });
    const r = await pay(bill.id, { amount: 6000.01 });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('Only ₹6,000 is still owed on this bill.');
    expect(await q(`select amount from payments where bill_id = '${bill.id}'`)).toEqual([{ amount: '4000.00' }]);
    expect((await q<{ paid_amount: string }>(`select paid_amount from bills where id = '${bill.id}'`))[0].paid_amount).toBe('4000.00');
  });

  it.each([[0], [-5], [1.234], ['abc'], [10_000_001]])('rejects the amount %j', async (amount) => {
    loginAs('ownerA');
    const [bill] = await stayBills(await book());
    expect((await pay(bill.id, { amount })).status).toBe(400);
    expect(await q(`select id from payments where bill_id = '${bill.id}'`)).toHaveLength(0);
  });

  it.each(['cash', 'upi', 'card', 'bank_transfer'])('records %s as money received by staff', async (method) => {
    loginAs('frontA');
    const [bill] = await stayBills(await book());
    expect((await pay(bill.id, { amount: 100, paymentMethod: method })).status).toBe(200);
    expect(await q(`select method from payments where bill_id = '${bill.id}'`)).toEqual([{ method }]);
  });

  it('rejects an unknown method', async () => {
    loginAs('frontA');
    const [bill] = await stayBills(await book());
    expect((await pay(bill.id, { amount: 100, paymentMethod: 'cheque' })).status).toBe(400);
  });

  it('two people recording at once can never take the bill past its total', async () => {
    loginAs('ownerA');
    const [bill] = await stayBills(await book());
    const [one, two] = await Promise.all([pay(bill.id, { amount: 6000 }), pay(bill.id, { amount: 6000 })]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    expect(await q(`select amount from payments where bill_id = '${bill.id}'`)).toEqual([{ amount: '6000.00' }]);
    expect((await q<{ paid_amount: string; status: string }>(`select paid_amount, status from bills where id = '${bill.id}'`))[0]).toEqual({ paid_amount: '6000.00', status: 'partial' });
  });

  it('a restaurant bill takes part payments too', async () => {
    loginAs('frontA');
    const r = await pay(A.bill, { amount: 500, paymentMethod: 'card', reference: '4242' });
    expect(r.json.bill).toMatchObject({ status: 'partial', paidAmount: 500, totalAmount: 1180 });
  });

  it('another business\'s bill cannot be paid, and the money is not recorded', async () => {
    loginAs('ownerA');
    expect((await pay(B.bill, { amount: 10 })).status).toBe(404);
    expect(await q(`select id from payments where bill_id = '${B.bill}'`)).toHaveLength(0);
  });
});

describe('the billing list', () => {
  it('filters by kind, shows the stay and its payments, and never shows another business\'s bills', async () => {
    loginAs('frontA');
    const id = await book();
    const [bill] = await stayBills(id);
    await pay(bill.id, { amount: 2500, paymentMethod: 'bank_transfer', reference: 'NEFT55' });

    const stays = (await call(billing.GET, 'GET', '/api/billing?kind=stay')).json;
    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({
      id: bill.id, kind: 'stay', guestName: 'Stay Guest', totalAmount: 10000, paidAmount: 2500, status: 'partial',
      stay: { roomNumber: '101', nights: 2, bookingStatus: 'confirmed' },
    });
    expect(stays[0].payments).toMatchObject([{ amount: 2500, method: 'bank_transfer', reference: 'NEFT55', receivedBy: 'Front A' }]);

    const food = (await call(billing.GET, 'GET', '/api/billing?kind=restaurant')).json;
    expect(food.map((b: { id: string }) => b.id)).toEqual([A.bill]);

    const all = (await call(billing.GET, 'GET', '/api/billing')).json;
    expect(all.map((b: { id: string }) => b.id).sort()).toEqual([A.bill, bill.id].sort());
    expect(all.map((b: { id: string }) => b.id)).not.toContain(B.bill);

    expect((await call(billing.GET, 'GET', '/api/billing?kind=other')).status).toBe(400);
  });

  it('a booking lists its live stay bill with its payments', async () => {
    loginAs('frontA');
    const id = await book();
    const [bill] = await stayBills(id);
    await pay(bill.id, { amount: 1000 });
    const list = (await call(bookings.GET, 'GET', '/api/bookings')).json as { id: string; bill: { id: string; status: string; totalAmount: number; paidAmount: number } | null; bills?: unknown }[];
    const mine = list.find((b) => b.id === id)!;
    expect(mine.bill).toEqual({ id: bill.id, status: 'partial', totalAmount: 10000, paidAmount: 1000 });
    expect(mine.bills).toBeUndefined();
    expect(list.find((b) => b.id === A.booking)!.bill).toBeNull(); // the seeded booking has no bill
  });
});
