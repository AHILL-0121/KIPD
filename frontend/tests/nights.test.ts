import { beforeEach, describe, expect, it } from 'vitest';
import * as bookings from '@/app/api/bookings/route';
import { nightsBetween } from '@/lib/stay-bill';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A;
const IST = 'Asia/Kolkata';
const at = (iso: string) => new Date(iso);

/** Nights are the number of calendar dates between arrival and departure in the hotel's own time zone, never less than one. */
describe('nights are counted by calendar date', () => {
  it('a normal stay: 14:00 check-in to 11:00 check-out', () => {
    expect(nightsBetween(at('2032-05-03T08:30:00Z'), at('2032-05-05T05:30:00Z'), IST)).toBe(2); // 3 May 14:00 to 5 May 11:00 IST
    expect(nightsBetween(at('2032-05-03T08:30:00Z'), at('2032-05-04T05:30:00Z'), IST)).toBe(1);
  });

  it('a late check-out or early arrival does not add a night', () => {
    expect(nightsBetween(at('2032-05-03T08:30:00Z'), at('2032-05-05T09:30:00Z'), IST)).toBe(2); // out at 15:00 instead of 11:00
    expect(nightsBetween(at('2032-05-03T03:30:00Z'), at('2032-05-05T05:30:00Z'), IST)).toBe(2); // in at 09:00 instead of 14:00
  });

  it('uses the hotel\'s dates: UTC midnight is still the same calendar day in India, but not in New York', () => {
    expect(nightsBetween(at('2032-05-03T00:00:00Z'), at('2032-05-05T00:00:00Z'), IST)).toBe(2);
    // New York is behind UTC: these instants fall on 2 May (22:00) and 4 May (23:00) there, so 2 nights.
    expect(nightsBetween(at('2032-05-03T02:00:00Z'), at('2032-05-05T03:00:00Z'), 'America/New_York')).toBe(2);
  });

  it('a 25-hour day (clocks go back) is still one night', () => {
    // New York, 1 Nov 2026: 00:30 to 00:30 next day is 25 hours of real time.
    const from = at('2026-11-01T04:30:00Z'), to = at('2026-11-02T05:30:00Z');
    expect(to.getTime() - from.getTime()).toBe(25 * 3_600_000);
    expect(nightsBetween(from, to, 'America/New_York')).toBe(1);
  });

  it('is never less than one', () => {
    expect(nightsBetween(at('2032-05-03T08:30:00Z'), at('2032-05-03T08:30:00Z'), IST)).toBe(1);
    expect(nightsBetween(at('2032-05-05T08:30:00Z'), at('2032-05-03T08:30:00Z'), IST)).toBe(1);
  });
});

describe('a booking made by staff uses the hotel\'s check-in and check-out times', () => {
  beforeEach(resetAndSeed);
  const make = (checkInDate: string, checkOutDate: string) =>
    call(bookings.POST, 'POST', '/api/bookings', { body: { roomId: A.room, guestName: 'Turnover Guest', guestEmail: 'turn@guest.test', checkInDate, checkOutDate } });

  it('a date-only booking is stored as 14:00 in and 11:00 out, hotel time', async () => {
    loginAs('frontA');
    const r = await make('2032-05-10', '2032-05-12');
    expect(r.status).toBe(200);
    const [row] = await q<{ check_in_date: string; check_out_date: string }>(`select check_in_date, check_out_date from bookings where id = '${r.json.booking.id}'`);
    expect(new Date(row.check_in_date).toISOString()).toBe('2032-05-10T08:30:00.000Z'); // 14:00 IST
    expect(new Date(row.check_out_date).toISOString()).toBe('2032-05-12T05:30:00.000Z'); // 11:00 IST
  });

  it('can start on the day another guest leaves (same-day turnover)', async () => {
    loginAs('frontA');
    // An online booking, which is stored at 14:00 / 11:00: out on 5 May at 11:00.
    await q(`insert into bookings (id, tenant_id, property_id, room_id, guest_id, status, source, check_in_date, check_out_date, total_amount)
             values ('00000000-0000-4000-8000-000000000901', '${A.tenant}', '${A.property}', '${A.room}', '${A.guest}', 'confirmed', 'online', '2032-05-03T08:30:00Z', '2032-05-05T05:30:00Z', '10000.00')`);
    const r = await make('2032-05-05', '2032-05-06');
    expect(r.status).toBe(200);
    // ...but not a night earlier.
    expect((await make('2032-05-04', '2032-05-05')).status).toBe(409);
  });

  it('prices by calendar nights', async () => {
    loginAs('frontA');
    const r = await make('2032-05-20', '2032-05-23');
    expect(r.json.booking.totalAmount).toBe('15000.00');
  });
});

describe('what a booking accepts as dates', () => {
  beforeEach(resetAndSeed);
  const make = (checkInDate: unknown, checkOutDate: unknown) =>
    call(bookings.POST, 'POST', '/api/bookings', { body: { roomId: A.room, guestName: 'Date Guest', guestEmail: 'd@guest.test', checkInDate, checkOutDate } });

  it('refuses a date that does not exist, or garbage, with a 400 not a 500', async () => {
    loginAs('frontA');
    expect((await make('2032-02-30', '2032-03-02')).status).toBe(400);
    expect((await make('2032-13-01', '2032-13-03')).status).toBe(400);
    expect((await make('soon', 'later')).status).toBe(400);
    expect((await make('2032-05-12', '2032-05-10')).status).toBe(400);
    expect((await make('2032-05-12', '2032-05-12')).status).toBe(400);
  });

  it('still takes full instants, kept exactly as sent', async () => {
    loginAs('frontA');
    const r = await make('2032-06-01T10:00:00Z', '2032-06-03T09:00:00Z');
    expect(r.status).toBe(200);
    const [row] = await q<{ check_in_date: string }>(`select check_in_date from bookings where id = '${r.json.booking.id}'`);
    expect(new Date(row.check_in_date).toISOString()).toBe('2032-06-01T10:00:00.000Z');
  });
});
