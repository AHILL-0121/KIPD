import { beforeEach, describe, expect, it } from 'vitest';
import * as bookings from '@/app/api/bookings/route';
import * as bookingById from '@/app/api/bookings/[id]/route';
import * as billing from '@/app/api/billing/route';
import * as postApi from '@/app/api/billing/[id]/post-to-room/route';
import { reviseStayBreakdown, postCharges, stayBillValues, type StayBreakdown } from '@/lib/stay-bill';
import { taxSettingsSchema } from '@/lib/gst';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ROOM2 = uuid(901), SUITE_TYPE = uuid(902), SUITE = uuid(903);

beforeEach(async () => {
  await resetAndSeed();
  // The seeded booking (Jan 2030) is out of the way; these tests make their own.
  await q(`update bookings set status = 'cancelled' where id = '${A.booking}'`);
  // A second room of the same type (5000 a night) and a suite of a dearer type (8000 a night, sleeps 4).
  await q(`insert into rooms (id, tenant_id, property_id, room_type_id, room_number, status) values ('${ROOM2}', '${A.tenant}', '${A.property}', '${A.roomType}', '102', 'available')`);
  await q(`insert into room_types (id, tenant_id, property_id, name, base_price, max_occupancy) values ('${SUITE_TYPE}', '${A.tenant}', '${A.property}', 'Suite', '8000.00', 4)`);
  await q(`insert into rooms (id, tenant_id, property_id, room_type_id, room_number, status) values ('${SUITE}', '${A.tenant}', '${A.property}', '${SUITE_TYPE}', '201', 'available')`);
  loginAs('frontA');
});

/** Room 101 costs 5000 a night: 2032-05-01 to 2032-05-03 is 2 nights = 10000. */
async function book(from = '2032-05-01', to = '2032-05-03', roomId = A.room, email = 'stay@guest.test') {
  const r = await call(bookings.POST, 'POST', '/api/bookings', { body: { roomId, guestName: 'Stay Guest', guestEmail: email, checkInDate: from, checkOutDate: to } });
  expect(r.status).toBe(200);
  return r.json.booking.id as string;
}
const act = (id: string, action: string) => call(bookingById.PATCH, 'PATCH', `/api/bookings/${id}`, { params: { id }, body: { action } });
const edit = (id: string, body: Record<string, unknown>) => call(bookingById.PATCH, 'PATCH', `/api/bookings/${id}`, { params: { id }, body });
const pay = (billId: string, amount: number) => call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId, amount, paymentMethod: 'cash' } });
type Bill = { id: string; status: string; total_amount: string; paid_amount: string; settled_at: string | null; items_breakdown: StayBreakdown };
const billOf = async (bookingId: string) => (await q<Bill>(`select * from bills where booking_id = '${bookingId}' and kind = 'stay' and status <> 'void'`))[0];
const bookingRow = async (id: string) => (await q<{ room_id: string; status: string; total_amount: string; num_guests: number; check_in_date: string; check_out_date: string }>(`select * from bookings where id = '${id}'`))[0];
const roomStatus = async (id: string) => (await q<{ status: string }>(`select status from rooms where id = '${id}'`))[0].status;

describe('a room is only "occupied" while a guest is in it', () => {
  it('a booking for a future date leaves the room as it was; check-in makes it occupied', async () => {
    const id = await book();
    expect(await roomStatus(A.room)).toBe('available');
    expect((await act(id, 'check-in')).status).toBe(200);
    expect(await roomStatus(A.room)).toBe('occupied');
  });

  it('cancelling a future booking does not free a room another guest is staying in', async () => {
    const now = await book('2032-05-01', '2032-05-03');
    const later = await book('2032-05-10', '2032-05-12', A.room, 'later@guest.test');
    await act(now, 'check-in');
    expect((await act(later, 'cancel')).status).toBe(200);
    expect(await roomStatus(A.room)).toBe('occupied');
  });

  it('cancelling a stay that was checked in by mistake frees the room again', async () => {
    const id = await book();
    await act(id, 'check-in');
    expect((await act(id, 'cancel')).status).toBe(200);
    expect(await roomStatus(A.room)).toBe('available');
  });

  it('actions that make no sense for the booking are refused and change nothing', async () => {
    const id = await book();
    expect((await act(id, 'check-out')).status).toBe(409); // never arrived
    expect((await bookingRow(id)).status).toBe('confirmed');
    await act(id, 'check-in');
    expect((await act(id, 'check-in')).status).toBe(409); // already in
    await act(id, 'check-out');
    expect(await roomStatus(A.room)).toBe('cleaning');
    expect((await act(id, 'cancel')).status).toBe(409); // the stay is over; cancelling would void a real bill
    expect((await act(id, 'check-in')).status).toBe(409);
    expect((await bookingRow(id)).status).toBe('checked_out');
    expect(await roomStatus(A.room)).toBe('cleaning');
    expect((await billOf(id)).status).toBe('open');
  });

  it('a second guest cannot be checked in while the first is still in the room', async () => {
    const first = await book('2032-05-01', '2032-05-03');
    const second = await book('2032-05-03', '2032-05-05', A.room, 'second@guest.test');
    await act(first, 'check-in');
    const r = await act(second, 'check-in');
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/still checked in/i);
    await act(first, 'check-out');
    expect((await act(second, 'check-in')).status).toBe(200);
  });
});

describe('changing a booking', () => {
  it('a longer stay is priced at the booked nightly rate and the bill follows', async () => {
    const id = await book();
    const r = await edit(id, { checkOutDate: '2032-05-05' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ booking: { nights: 4, totalAmount: 20000 }, billTotal: 20000 });
    expect((await bookingRow(id)).total_amount).toBe('20000.00');
    const bill = await billOf(id);
    expect(bill).toMatchObject({ status: 'open', total_amount: '20000.00' });
    expect(bill.items_breakdown.items).toEqual([{ name: 'Room 101 (Type A), 4 nights', qty: 4, rate: 5000, amt: 20000 }]);
  });

  it('the booked rate is kept even if the room type has since become dearer', async () => {
    const id = await book();
    await q(`update room_types set base_price = '6000.00' where id = '${A.roomType}'`);
    expect((await edit(id, { checkOutDate: '2032-05-04' })).json.booking.totalAmount).toBe(15000);
  });

  it('moving to a different room type charges that type\'s rate, and names the new room on the bill', async () => {
    const id = await book();
    const r = await edit(id, { roomId: SUITE });
    expect(r.status).toBe(200);
    expect(await bookingRow(id)).toMatchObject({ room_id: SUITE, total_amount: '16000.00' });
    const bill = await billOf(id);
    expect(bill.total_amount).toBe('16000.00');
    expect(bill.items_breakdown.items[0].name).toBe('Room 201 (Suite), 2 nights');
    // a future booking: neither room's status moves
    expect(await roomStatus(A.room)).toBe('available');
    expect(await roomStatus(SUITE)).toBe('available');
  });

  it('a part payment is kept: the bill stays part paid, or becomes paid when the stay shrinks to what was paid', async () => {
    const id = await book('2032-05-01', '2032-05-04'); // 15000
    const bill = await billOf(id);
    expect((await pay(bill.id, 5000)).status).toBe(200);
    expect((await edit(id, { checkOutDate: '2032-05-03' })).status).toBe(200); // 10000
    expect(await billOf(id)).toMatchObject({ status: 'partial', total_amount: '10000.00', paid_amount: '5000.00' });
    expect((await edit(id, { checkOutDate: '2032-05-02' })).status).toBe(200); // 5000 = what was paid
    const paid = await billOf(id);
    expect(paid).toMatchObject({ status: 'paid', total_amount: '5000.00', paid_amount: '5000.00' });
    expect(paid.settled_at).toBeTruthy();
    // ...and longer again: money is owed again, so it is no longer "settled"
    expect((await edit(id, { checkOutDate: '2032-05-03' })).status).toBe(200);
    expect(await billOf(id)).toMatchObject({ status: 'partial', settled_at: null });
  });

  it('is refused when more has been paid than the new price, and nothing changes', async () => {
    const id = await book('2032-05-01', '2032-05-04'); // 15000
    await pay((await billOf(id)).id, 12000);
    const r = await edit(id, { checkOutDate: '2032-05-03' }); // would be 10000
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/Refund the difference/);
    expect((await bookingRow(id)).total_amount).toBe('15000.00');
    expect((await billOf(id)).total_amount).toBe('15000.00');
  });

  it('is refused when another booking has the room for the new dates', async () => {
    const id = await book('2032-05-01', '2032-05-03');
    await book('2032-05-03', '2032-05-06', A.room, 'next@guest.test');
    const r = await edit(id, { checkOutDate: '2032-05-04' });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/already booked/);
    // the same dates in the other room are fine
    expect((await edit(id, { checkOutDate: '2032-05-04', roomId: ROOM2 })).status).toBe(200);
  });

  it('a booking does not clash with itself when its dates move a little', async () => {
    const id = await book('2032-05-01', '2032-05-03');
    expect((await edit(id, { checkInDate: '2032-05-02', checkOutDate: '2032-05-04' })).status).toBe(200);
    expect((await bookingRow(id)).total_amount).toBe('10000.00');
  });

  it('checks the room is big enough, is in service, and that the dates are real and in order', async () => {
    const id = await book();
    expect((await edit(id, { numGuests: 3 })).status).toBe(409); // Type A sleeps 2
    expect((await edit(id, { numGuests: 3, roomId: SUITE })).status).toBe(200);
    await q(`update rooms set status = 'maintenance' where id = '${ROOM2}'`);
    expect((await edit(id, { roomId: ROOM2 })).status).toBe(409);
    expect((await edit(id, { checkOutDate: '2032-05-01' })).status).toBe(400);
    expect((await edit(id, { checkOutDate: '2032-02-30' })).status).toBe(400);
    expect((await edit(id, {})).status).toBe(400);
    expect((await edit(id, { totalAmount: 1 })).status).toBe(400); // the price cannot be set directly
    expect((await edit(id, { status: 'checked_out' })).status).toBe(400);
  });

  it('a pending online request can be changed; it still has no bill', async () => {
    const id = uuid(950);
    await q(`insert into bookings (id, tenant_id, property_id, room_id, guest_id, status, source, check_in_date, check_out_date, total_amount)
             values ('${id}', '${A.tenant}', '${A.property}', '${A.room}', '${A.guest}', 'pending', 'online', '2032-06-01T08:30:00Z', '2032-06-03T05:30:00Z', '10000.00')`);
    expect((await edit(id, { checkOutDate: '2032-06-04' })).status).toBe(200);
    expect(await bookingRow(id)).toMatchObject({ status: 'pending', total_amount: '15000.00' });
    expect(await billOf(id)).toBeUndefined();
    // confirming afterwards bills the new stay
    await act(id, 'confirm');
    expect((await billOf(id)).total_amount).toBe('15000.00');
  });

  it('a finished or cancelled booking cannot be changed', async () => {
    const id = await book();
    await act(id, 'cancel');
    expect((await edit(id, { checkOutDate: '2032-05-05' })).status).toBe(409);
  });

  it('once the tax invoice is issued the stay cannot change', async () => {
    const id = await book();
    await q(`update bills set invoice_number = 'INV/32-33/0001', invoice_seq = 1, invoice_issued_at = now(), invoice_data = '{}'::jsonb where booking_id = '${id}'`);
    const r = await edit(id, { checkOutDate: '2032-05-05' });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/INV\/32-33\/0001/);
    expect((await bookingRow(id)).total_amount).toBe('10000.00');
  });

  it('waiters and kitchen staff cannot change bookings, and another business cannot either', async () => {
    const id = await book();
    for (const who of ['waiterA', 'kitchenA'] as const) { loginAs(who); expect((await edit(id, { checkOutDate: '2032-05-05' })).status).toBe(403); }
    loginAs('ownerB');
    expect((await edit(id, { checkOutDate: '2032-05-05' })).status).toBe(404);
    loginAs('ownerA');
    expect((await edit(id, { roomId: B.room })).status).toBe(404); // cannot move into another business's room
    expect(await bookingRow(id)).toMatchObject({ room_id: A.room, total_amount: '10000.00' });
  });
});

describe('a guest who is already in the house', () => {
  it('can stay longer, but the arrival date is fixed', async () => {
    const id = await book();
    await act(id, 'check-in');
    expect((await edit(id, { checkInDate: '2032-04-30' })).status).toBe(409);
    expect((await edit(id, { checkInDate: '2032-05-01', checkOutDate: '2032-05-06' })).status).toBe(200); // same arrival day re-sent by the form
    expect((await billOf(id)).total_amount).toBe('25000.00');
  });

  it('can move rooms: the old room goes to cleaning and the new one is occupied', async () => {
    const id = await book();
    await act(id, 'check-in');
    expect((await edit(id, { roomId: ROOM2 })).status).toBe(200);
    expect(await roomStatus(A.room)).toBe('cleaning');
    expect(await roomStatus(ROOM2)).toBe('occupied');
    expect((await billOf(id)).items_breakdown.items[0].name).toBe('Room 102 (Type A), 2 nights');
  });

  it('cannot move into a room that is not free right now', async () => {
    const id = await book();
    await act(id, 'check-in');
    await q(`update rooms set status = 'cleaning' where id = '${ROOM2}'`);
    expect((await edit(id, { roomId: ROOM2 })).status).toBe(409);
    expect(await roomStatus(A.room)).toBe('occupied');
  });

  it('keeps restaurant charges posted to the room, to the paisa, when the stay changes', async () => {
    const id = await book();
    await act(id, 'check-in');
    const stay = await billOf(id);
    // A restaurant bill of 1000 + 5% GST, charged to the room.
    const food = uuid(960);
    await q(`insert into bills (id, tenant_id, guest_id, kind, total_amount, status, items_breakdown) values ('${food}', '${A.tenant}', '${A.guest}', 'restaurant', '1050.00', 'open',
             '{"items":[{"name":"Thali","qty":2,"rate":333.33,"amt":666.66},{"name":"Lassi","qty":1,"rate":333.34,"amt":333.34}],"subtotal":1000,"cgst":25,"sgst":25,"total":1050}'::jsonb)`);
    expect((await call(postApi.POST, 'POST', `/api/billing/${food}/post-to-room`, { params: { id: food }, body: { stayBillId: stay.id } })).status).toBe(200);
    expect((await billOf(id)).total_amount).toBe('11050.00');

    expect((await edit(id, { checkOutDate: '2032-05-04' })).status).toBe(200); // 3 nights = 15000
    const after = await billOf(id);
    expect(after.total_amount).toBe('16050.00');
    expect(after.items_breakdown.items.map((l) => l.name)).toEqual(['Room 101 (Type A), 3 nights', 'Restaurant: Thali', 'Restaurant: Lassi']);
    expect(after.items_breakdown).toMatchObject({ subtotal: 16000, cgst: 25, sgst: 25, total: 16050 });
    expect(after.items_breakdown.postings).toHaveLength(1);
  });
});

describe('revising a bill with room GST (pure)', () => {
  const tax = taxSettingsSchema.parse({ gstin: '29ABCDE1234F1Z5', stateCode: '29', roomGst: 'slab' });
  const stay = (total: string, checkOut: string) => stayBillValues({
    tenantId: 't', bookingId: 'b', guestId: 'g', roomNumber: '101', roomTypeName: 'Deluxe',
    checkIn: new Date('2032-05-01T08:30:00Z'), checkOut: new Date(checkOut), total, tax,
  }).itemsBreakdown as StayBreakdown;

  it('room and food at the same 5% rate: the food share survives a change of nights exactly', () => {
    const two = stay('10000.00', '2032-05-03T05:30:00Z'); // 5000 a night -> 5% -> 10500
    expect(two.total).toBe(10500);
    const withFood = postCharges(two, { items: [{ name: 'Dinner', qty: 1, rate: 333.33, amt: 333.33 }], ratePercent: 5, billId: 'f1', by: 'Asha', at: new Date() });
    const foodPaise = withFood.totalPaise - 1050000;
    const three = stay('15000.00', '2032-05-04T05:30:00Z'); // 15750
    const revised = reviseStayBreakdown(withFood.breakdown, three);
    expect(revised.totalPaise).toBe(1575000 + foodPaise);
    expect(revised.breakdown.taxSummary).toHaveLength(1); // one 5% group holding both
    expect(Math.round((revised.breakdown.cgst + revised.breakdown.sgst + revised.breakdown.subtotal) * 100)).toBe(revised.totalPaise);
  });

  it('room at 18% and food at 5% stay in separate groups', () => {
    const dear = stay('20000.00', '2032-05-03T05:30:00Z'); // 10000 a night -> 18%
    const withFood = postCharges(dear, { items: [{ name: 'Dinner', qty: 1, rate: 1000, amt: 1000 }], ratePercent: 5, billId: 'f1', by: 'Asha', at: new Date() });
    const revised = reviseStayBreakdown(withFood.breakdown, stay('30000.00', '2032-05-04T05:30:00Z'));
    expect(revised.breakdown.taxSummary).toEqual([{ rate: 18, taxable: 30000, tax: 5400 }, { rate: 5, taxable: 1000, tax: 50 }]);
    expect(revised.totalPaise).toBe(3645000);
  });

  it('a bill with nothing posted is simply the new stay', () => {
    const fresh = stay('15000.00', '2032-05-04T05:30:00Z');
    expect(reviseStayBreakdown(stay('10000.00', '2032-05-03T05:30:00Z'), fresh).breakdown).toBe(fresh);
  });
});
