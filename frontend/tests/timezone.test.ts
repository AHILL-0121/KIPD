import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dashboard from '@/app/api/dashboard/stats/route';
import { isValidTimeZone, startOfDayInZone, startOfNextDayInZone } from '@/lib/tz';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A;
const iso = (d: Date) => d.toISOString();

describe('startOfDayInZone', () => {
  it('India (UTC+5:30, no daylight saving): midnight is 18:30 UTC the evening before', () => {
    expect(iso(startOfDayInZone('Asia/Kolkata', new Date('2026-10-29T20:00:00Z')))).toBe('2026-10-29T18:30:00.000Z'); // 01:30 on the 30th in India
    expect(iso(startOfDayInZone('Asia/Kolkata', new Date('2026-10-29T10:00:00Z')))).toBe('2026-10-28T18:30:00.000Z'); // 15:30 on the 29th in India
  });

  it('is exact at the boundary', () => {
    expect(iso(startOfDayInZone('Asia/Kolkata', new Date('2026-10-29T18:29:59.999Z')))).toBe('2026-10-28T18:30:00.000Z');
    expect(iso(startOfDayInZone('Asia/Kolkata', new Date('2026-10-29T18:30:00.000Z')))).toBe('2026-10-29T18:30:00.000Z');
  });

  it('UTC is just midnight UTC', () => {
    expect(iso(startOfDayInZone('UTC', new Date('2026-10-29T20:00:00Z')))).toBe('2026-10-29T00:00:00.000Z');
  });

  it('handles daylight saving: a 23 hour day and a 25 hour day', () => {
    // US spring forward: Sunday 8 March 2026. Midnight is still EST (UTC-5); the next midnight is EDT (UTC-4).
    const spring = new Date('2026-03-08T15:00:00Z');
    expect(iso(startOfDayInZone('America/New_York', spring))).toBe('2026-03-08T05:00:00.000Z');
    expect(iso(startOfNextDayInZone('America/New_York', spring))).toBe('2026-03-09T04:00:00.000Z');
    // US fall back: Sunday 1 November 2026. Midnight is EDT (UTC-4); the next midnight is EST (UTC-5).
    const fall = new Date('2026-11-01T15:00:00Z');
    expect(iso(startOfDayInZone('America/New_York', fall))).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(startOfNextDayInZone('America/New_York', fall))).toBe('2026-11-02T05:00:00.000Z');
  });

  it('the next day always starts after "now" and at most 25 hours after the day started', () => {
    for (const tz of ['Asia/Kolkata', 'UTC', 'America/New_York', 'Australia/Lord_Howe', 'Pacific/Auckland']) {
      for (const at of ['2026-01-15T03:00:00Z', '2026-04-05T12:00:00Z', '2026-10-25T22:30:00Z']) {
        const now = new Date(at), start = startOfDayInZone(tz, now), next = startOfNextDayInZone(tz, now);
        expect(start.getTime(), `${tz} ${at}`).toBeLessThanOrEqual(now.getTime());
        expect(next.getTime(), `${tz} ${at}`).toBeGreaterThan(now.getTime());
        expect((next.getTime() - start.getTime()) / 3_600_000).toBeGreaterThanOrEqual(23);
        expect((next.getTime() - start.getTime()) / 3_600_000).toBeLessThanOrEqual(25);
      }
    }
  });

  it('validates zone names', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('the dashboard uses the hotel\'s day, not the server\'s', () => {
  beforeEach(async () => {
    await resetAndSeed();
    // Park everything seeded in the past so only the orders below count as "today".
    await q(`update orders set created_at = '2020-01-01'`);
    await q(`update bookings set created_at = '2020-01-01'`);
    // 17:00 UTC = 22:30 in India on the 29th.  19:00 UTC = 00:30 in India on the 30th.
    await q(`insert into orders (tenant_id, outlet_id, total_amount, status, created_at) values ('${A.tenant}', '${A.outlet}', '111.00', 'served', '2026-10-29T17:00:00Z')`);
    await q(`insert into orders (tenant_id, outlet_id, total_amount, status, created_at) values ('${A.tenant}', '${A.outlet}', '222.00', 'served', '2026-10-29T19:00:00Z')`);
    // It is 01:30 on 30 October in India (20:00 UTC on the 29th).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T20:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const todayRevenue = async () => { loginAs('ownerA'); return (await call(dashboard.GET, 'GET', '/api/dashboard/stats')).json.todayRevenue; };

  it('India: only the order placed after local midnight counts as today', async () => {
    expect(await todayRevenue()).toBe(222);
  });

  it('the same moment in UTC is a different "today", so the same data gives a different answer', async () => {
    await q(`update tenants set timezone = 'UTC' where id = '${A.tenant}'`);
    expect(await todayRevenue()).toBe(333); // both orders are on the 29th... and 17:00 and 19:00 UTC are both "today" in UTC
  });

  it('a tenant in New York is still on the evening of the 29th', async () => {
    await q(`update tenants set timezone = 'America/New_York' where id = '${A.tenant}'`);
    expect(await todayRevenue()).toBe(333); // 16:00 EDT local time on the 29th: both orders are today
  });
});
