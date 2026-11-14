import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { bills, bookings, roomTypes, rooms } from '@/db/schema';
import { ROLES, requireTenant } from '@/lib/auth';
import { HttpError, handleError, parseJson } from '@/lib/http';
import { ownedBooking, ownedRoom } from '@/lib/tenant-scope';
import { nightsBetween, reviseStayBreakdown, stayBillValues, type StayBreakdown } from '@/lib/stay-bill';
import { getTaxSettings } from '@/lib/tax-settings';
import { dateInput, toCheckIn, toCheckOut } from '@/lib/booking-dates';
import { todayInZone } from '@/lib/tz';

const actionSchema = z.object({ action: z.enum(['confirm', 'check-in', 'check-out', 'cancel']) });
// Anything left out stays as it is.
const editSchema = z.object({
  checkInDate: dateInput.optional(),
  checkOutDate: dateInput.optional(),
  roomId: z.string().uuid().optional(),
  numGuests: z.coerce.number().int().min(1).max(20).optional(),
}).strict();
const schema = z.union([actionSchema, editSchema]);

// `from`: the states a booking may be in for the action to make sense (checking out someone who never arrived does not).
// `room: null` means the room's status is left alone (confirming a future booking must not mark the room occupied).
const TRANSITIONS = {
  confirm: { booking: 'confirmed', room: null, from: ['pending'], refused: 'Only a pending booking can be confirmed.' },
  'check-in': { booking: 'checked_in', room: 'occupied', from: ['pending', 'confirmed'], refused: 'Only a booking that has not arrived yet can be checked in.' },
  'check-out': { booking: 'checked_out', room: 'cleaning', from: ['checked_in'], refused: 'Only a guest who is checked in can be checked out.' },
  // The room is only freed when this guest was actually in it (see roomStatus below).
  cancel: { booking: 'cancelled', room: null, from: ['pending', 'confirmed', 'checked_in'], refused: 'This booking is already finished or cancelled.' },
} as const;

const EDITABLE = ['pending', 'confirmed', 'checked_in'];
const rowsOf = (result: unknown) => (result as { rows?: unknown[] }).rows ?? [];
const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

/**
 * Change a booking's dates, room or number of guests. The price follows: the nightly rate that was booked is kept
 * while the room type stays the same, and a different room type is charged at its own current rate. The stay bill's
 * room line and total follow in the same statement (restaurant charges already on the bill are kept), so the booking
 * and its bill can never disagree. Refused once the invoice has been issued, or when more has already been paid than
 * the new price (refund first).
 */
async function editBooking(tenantId: string, timezone: string, booking: typeof bookings.$inferSelect, body: z.infer<typeof editSchema>) {
  if (!EDITABLE.includes(booking.status)) throw new HttpError(409, 'Only an upcoming or current booking can be changed.');

  // A date that is the same calendar day as the stored one keeps the stored time (an online booking's exact arrival time, say).
  const keepOrSet = (sent: string | Date | undefined, stored: Date, convert: (v: string | Date, tz: string) => Date) =>
    sent === undefined || (typeof sent === 'string' && sent === todayInZone(timezone, stored)) ? stored : convert(sent, timezone);
  const checkIn = keepOrSet(body.checkInDate, booking.checkInDate, toCheckIn);
  const checkOut = keepOrSet(body.checkOutDate, booking.checkOutDate, toCheckOut);
  if (!(checkOut > checkIn)) throw new HttpError(400, 'Check-out must be after check-in');
  const staying = booking.status === 'checked_in';
  if (staying && checkIn.getTime() !== booking.checkInDate.getTime()) throw new HttpError(409, 'The guest has already arrived, so the arrival date cannot change.');

  const oldRoom = await ownedRoom(tenantId, booking.roomId);
  const roomChanged = body.roomId !== undefined && body.roomId !== booking.roomId;
  const room = roomChanged ? await ownedRoom(tenantId, body.roomId) : oldRoom;
  const numGuests = body.numGuests ?? booking.numGuests;
  const datesChanged = checkIn.getTime() !== booking.checkInDate.getTime() || checkOut.getTime() !== booking.checkOutDate.getTime();
  if (!roomChanged && !datesChanged && numGuests === booking.numGuests) throw new HttpError(400, 'Nothing to change');

  if (roomChanged) {
    if (room.status === 'maintenance' || room.status === 'blocked') throw new HttpError(409, `Room ${room.roomNumber} is out of service.`);
    if (staying && room.status !== 'available') throw new HttpError(409, `Room ${room.roomNumber} is not free right now.`);
  }
  const [roomType] = await db.select().from(roomTypes).where(and(eq(roomTypes.id, room.roomTypeId), eq(roomTypes.tenantId, tenantId))).limit(1);
  if (!roomType) throw new HttpError(409, 'That room has no room type.');
  if (roomType.maxOccupancy && numGuests > roomType.maxOccupancy) {
    throw new HttpError(409, `Room ${room.roomNumber} sleeps ${roomType.maxOccupancy}. Choose a bigger room or fewer guests.`);
  }

  // Friendly answer first; the database's exclusion constraint is what actually guarantees it.
  const clash = await db.select({ id: bookings.id }).from(bookings).where(and(
    eq(bookings.tenantId, tenantId), eq(bookings.roomId, room.id), ne(bookings.id, booking.id),
    inArray(bookings.status, ['pending', 'confirmed', 'checked_in']),
    lt(bookings.checkInDate, checkOut), gt(bookings.checkOutDate, checkIn),
  )).limit(1);
  if (clash[0]) throw new HttpError(409, `Room ${room.roomNumber} is already booked for those dates.`);

  const oldNights = nightsBetween(booking.checkInDate, booking.checkOutDate, timezone);
  const nights = nightsBetween(checkIn, checkOut, timezone);
  const nightlyPaise = room.roomTypeId === oldRoom.roomTypeId
    ? Math.round((Number(booking.totalAmount) * 100) / oldNights)
    : Math.round(Number(roomType.basePrice) * 100);
  const totalAmount = ((nightlyPaise * nights) / 100).toFixed(2);

  const [bill] = await db.select().from(bills).where(and(
    eq(bills.tenantId, tenantId), eq(bills.bookingId, booking.id), eq(bills.kind, 'stay'), ne(bills.status, 'void'),
  )).limit(1);

  let billTotal: string | null = null;
  let breakdownJson = '{}';
  if (bill) {
    if (bill.invoiceNumber) {
      throw new HttpError(409, `Invoice ${bill.invoiceNumber} has already been issued for this stay, and an issued invoice cannot change. Issue a credit note, or make a new booking for the extra nights.`);
    }
    const fresh = stayBillValues({
      tenantId, bookingId: booking.id, guestId: booking.guestId, roomNumber: room.roomNumber, roomTypeName: roomType.name,
      checkIn, checkOut, timeZone: timezone, total: totalAmount, tax: await getTaxSettings(tenantId),
    });
    const { breakdown, totalPaise } = reviseStayBreakdown(bill.itemsBreakdown as Partial<StayBreakdown> | null, fresh.itemsBreakdown as StayBreakdown);
    const paidPaise = Math.round(Number(bill.paidAmount ?? 0) * 100);
    if (paidPaise > totalPaise) {
      throw new HttpError(409, `${money(paidPaise)} has already been paid, which is more than the new total of ${money(totalPaise)}. Refund the difference before changing this booking.`);
    }
    billTotal = (totalPaise / 100).toFixed(2);
    breakdownJson = JSON.stringify(breakdown);
  }
  const newBillTotal = billTotal ?? '0';

  const move = staying && roomChanged; // a guest who is in the house changes rooms now
  const billGuard = bill
    ? sql`exists (select 1 from bills where id = ${bill.id} and tenant_id = ${tenantId} and status in ('open', 'partial', 'paid')
        and invoice_number is null and total_amount = ${bill.totalAmount}::numeric and coalesce(paid_amount, 0) <= ${newBillTotal}::numeric)`
    : sql`true`;
  const roomGuard = move ? sql`exists (select 1 from rooms where id = ${room.id} and tenant_id = ${tenantId} and status = 'available')` : sql`true`;

  // One statement: the booking only changes if it, its bill and the new room are still as just read, and the bill and
  // the rooms only change if the booking did. An overlap sneaking in meanwhile is refused by the database (409).
  const result = await db.execute(sql`
    with guard as (
      select 1 as ok where ${billGuard} and ${roomGuard}
    ), bk as (
      update bookings set
        room_id = ${room.id}, property_id = ${room.propertyId},
        check_in_date = ${checkIn.toISOString()}::timestamptz, check_out_date = ${checkOut.toISOString()}::timestamptz,
        num_guests = ${numGuests}, total_amount = ${totalAmount}::numeric
      where id = ${booking.id} and tenant_id = ${tenantId} and status = ${booking.status} and room_id = ${booking.roomId}
        and total_amount = ${booking.totalAmount}::numeric and exists (select 1 from guard)
      returning id
    ), bl as (
      update bills set
        items_breakdown = ${breakdownJson}::jsonb,
        total_amount = ${newBillTotal}::numeric,
        status = case when coalesce(paid_amount, 0) >= ${newBillTotal}::numeric then 'paid' when coalesce(paid_amount, 0) > 0 then 'partial' else 'open' end,
        settled_at = case when coalesce(paid_amount, 0) >= ${newBillTotal}::numeric then coalesce(settled_at, now()) else null end
      where id = ${bill?.id ?? null} and tenant_id = ${tenantId} and exists (select 1 from bk)
      returning id
    ), left_room as (
      update rooms set status = 'cleaning'
      where id = ${move ? oldRoom.id : null} and tenant_id = ${tenantId} and exists (select 1 from bk)
      returning id
    ), new_room as (
      update rooms set status = 'occupied'
      where id = ${move ? room.id : null} and tenant_id = ${tenantId} and exists (select 1 from bk)
      returning id
    )
    select id from bk
  `);
  if (rowsOf(result).length === 0) throw new HttpError(409, 'This booking or its bill changed while you were editing. Please check and try again.');

  return NextResponse.json({
    success: true,
    booking: { id: booking.id, roomId: room.id, checkInDate: checkIn, checkOutDate: checkOut, numGuests, nights, totalAmount: Number(totalAmount) },
    ...(billTotal ? { billTotal: Number(billTotal) } : {}),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId, timezone } = await requireTenant(ROLES.frontDesk);
    const body = await parseJson(request, schema);

    // 404 if the booking isn't in this tenant's properties.
    const booking = await ownedBooking(tenantId, params.id);
    if (!('action' in body)) return await editBooking(tenantId, timezone, booking, body);

    const { action } = body;
    const next = TRANSITIONS[action];
    if (!(next.from as readonly string[]).includes(booking.status)) throw new HttpError(409, next.refused);

    // What this leaves the room as: occupied on arrival, cleaning on departure, and free again when a check-in is
    // undone by cancelling. A booking that never arrived leaves the room exactly as it is, so cancelling next
    // week's booking cannot "free" a room someone else is staying in today.
    const roomStatus = action === 'cancel' ? (booking.status === 'checked_in' ? 'available' : null) : next.room;

    if (action === 'check-in') {
      const [inHouse] = await db.select({ id: bookings.id }).from(bookings).where(and(
        eq(bookings.tenantId, tenantId), eq(bookings.roomId, booking.roomId), eq(bookings.status, 'checked_in'), ne(bookings.id, booking.id),
      )).limit(1);
      if (inHouse) throw new HttpError(409, 'Another guest is still checked in to this room. Check them out first.');
    }

    const writes: unknown[] = [
      db.update(bookings).set({ status: next.booking }).where(and(eq(bookings.id, booking.id), eq(bookings.tenantId, tenantId)))
    ];
    if (roomStatus) {
      writes.push(db.update(rooms).set({ status: roomStatus }).where(and(eq(rooms.id, booking.roomId), eq(rooms.tenantId, tenantId))));
    }

    // Confirming (or checking in a booking that was never confirmed) opens the stay's bill. Doing it twice is harmless:
    // a booking can only have one live stay bill.
    if (action === 'confirm' || action === 'check-in') {
      const full = await db.query.bookings.findFirst({
        where: and(eq(bookings.id, booking.id), eq(bookings.tenantId, tenantId)),
        with: { room: { with: { roomType: true } } },
      });
      if (!full?.room) throw new HttpError(409, 'This booking\'s room no longer exists.');
      writes.push(db.insert(bills).values(stayBillValues({
        tenantId, bookingId: booking.id, guestId: booking.guestId, roomNumber: full.room.roomNumber,
        roomTypeName: full.room.roomType.name, checkIn: booking.checkInDate, checkOut: booking.checkOutDate, timeZone: timezone, total: booking.totalAmount, tax: await getTaxSettings(tenantId),
      })).onConflictDoNothing());
    }

    // Cancelling voids the bill. Money already paid on it is reported so the front desk can refund it by hand.
    let voids = false;
    if (action === 'cancel') {
      voids = true;
      writes.push(db.update(bills).set({ status: 'void' })
        .where(and(eq(bills.tenantId, tenantId), eq(bills.bookingId, booking.id), eq(bills.kind, 'stay'), inArray(bills.status, ['open', 'partial', 'paid'])))
        .returning({ paidAmount: bills.paidAmount }));
    }

    // db.batch wants a typed, non-empty tuple; the statements here are built conditionally.
    const results = (await db.batch(writes as never)) as unknown as { paidAmount: string | null }[][];
    const refundDue = voids ? Number(results[results.length - 1][0]?.paidAmount ?? 0) : 0;

    return NextResponse.json({ success: true, ...(refundDue > 0 ? { refundDue } : {}) });
  } catch (error) {
    return handleError(error, 'Failed to update booking');
  }
}
