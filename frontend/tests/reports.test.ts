import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as analytics from '@/app/api/analytics/route';
import * as dashboard from '@/app/api/dashboard/stats/route';
import { buildPeriod, changeText } from '@/lib/periods';
import { call, ids, loginAs, q, resetAndSeed, type Persona } from './helpers/harness';

const A = ids.A, B = ids.B;
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Reports, checked against data whose answers are worked out by hand.
 * "Now" is 01:30 on Friday 30 October 2026 in India (20:00 UTC on Thursday 29th), so the order of events
 * around local midnight matters. Everything below is in the restaurant's own time (Asia/Kolkata, UTC+5:30).
 */
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-29T20:00:00Z')); });
afterEach(() => vi.useRealTimers());

const T_A2 = u(950), CAT_DRINKS = u(951), ITEM_A2 = u(952);

async function seedReportData() {
  await resetAndSeed();
  vi.setSystemTime(new Date('2026-10-29T20:00:00Z')); // resetAndSeed may use real time internally
  // park the generic seed in the past so only the data below counts
  await q(`update orders set created_at = '2020-01-01', status = 'closed'`);
  await q(`update bookings set created_at = '2020-01-01'`);
  // a second table, a drinks category and a drinks item for tenant A
  await q(`insert into tables (id, tenant_id, outlet_id, table_number) values ('${T_A2}', '${A.tenant}', '${A.outlet}', 'T-2')`);
  await q(`insert into menu_categories (id, tenant_id, outlet_id, name) values ('${CAT_DRINKS}', '${A.tenant}', '${A.outlet}', 'Drinks')`);
  await q(`insert into menu_items (id, tenant_id, outlet_id, category_id, name, price) values ('${ITEM_A2}', '${A.tenant}', '${A.outlet}', '${CAT_DRINKS}', 'Dish A2', '50.00')`);

  const order = async (n: number, at: string, status: string, tableId: string, lines: [string, number, number][]) => {
    const total = lines.reduce((s, [, qty, price]) => s + qty * price, 0);
    await q(`insert into orders (id, tenant_id, outlet_id, table_id, total_amount, status, created_at) values ('${u(n)}', '${A.tenant}', '${A.outlet}', '${tableId}', '${total}', '${status}', '${at}')`);
    for (const [item, qty, price] of lines) await q(`insert into order_items (tenant_id, order_id, menu_item_id, quantity, price) values ('${A.tenant}', '${u(n)}', '${item}', ${qty}, '${price}')`);
  };
  await order(960, '2026-10-29T17:00:00Z', 'closed',    A.table, [[A.item, 1, 100]]);                       // 22:30 on the 29th (yesterday, locally)
  await order(961, '2026-10-29T19:00:00Z', 'preparing', T_A2,    [[A.item, 2, 100], [ITEM_A2, 2, 50]]);     // 00:30 on the 30th (today, locally)
  await order(962, '2026-10-29T19:30:00Z', 'cancelled', A.table, [[A.item, 3, 100]]);                       // cancelled: must never count
  await order(963, '2026-10-23T05:00:00Z', 'closed',    A.table, [[A.item, 10, 100]]);                      // 23 October: last week, this month
  // another tenant with a huge order inside the window: must never leak
  await q(`insert into orders (tenant_id, outlet_id, table_id, total_amount, status, created_at) values ('${B.tenant}', '${B.outlet}', '${B.table}', '99999', 'closed', '2026-10-29T19:00:00Z')`);
}

const report = (range?: string, who: Persona = 'ownerA') => { loginAs(who); return call(analytics.GET, 'GET', `/api/analytics${range ? `?range=${range}` : ''}`); };

describe('analytics: revenue and orders', () => {
  beforeEach(seedReportData);

  it('this week = yesterday + today, ignoring the cancelled order, and compares with the week before', async () => {
    const r = (await report('week')).json;
    expect(r.revenue).toBe(400);           // 100 + 300
    expect(r.guests).toBe(2);              // orders
    expect(r.avgOrderValue).toBe(200);
    expect(r.revenueChange).toBe('−60.0% vs previous period'); // previous 7 days (17-23 Oct): only the 1,000 order
  });

  it('today starts at LOCAL midnight: the 22:30 order is yesterday, the 00:30 order is today', async () => {
    const r = (await report('day')).json;
    expect(r.revenue).toBe(300);
    expect(r.guests).toBe(1);
    expect(r.revenueData).toHaveLength(24);
    expect(r.revenueData[0]).toEqual({ date: '00:00', food: 300 });
    expect(r.revenueData.filter((p: { food: number }) => p.food > 0)).toHaveLength(1);
  });

  it('week chart has one point per day, zero on quiet days, in the right order', async () => {
    const r = (await report('week')).json;
    expect(r.revenueData.map((p: { date: string }) => p.date)).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(r.revenueData.map((p: { food: number }) => p.food)).toEqual([0, 0, 0, 0, 0, 100, 300]);
  });

  it('month and year widen the window', async () => {
    const month = (await report('month')).json;
    expect(month.revenue).toBe(1400);
    expect(month.revenueData).toHaveLength(30);
    expect(month.revenueData.at(-1)).toEqual({ date: '30 Oct', food: 300 });

    const year = (await report('year')).json;
    expect(year.revenue).toBe(1400);
    expect(year.revenueData).toHaveLength(12);
    expect(year.revenueData.at(-1)).toEqual({ date: 'Oct', food: 1400 });
    expect(year.revenueData[0].date).toBe('Nov'); // the window is the last 12 months
  });

  it('an unknown range falls back to the week instead of failing', async () => {
    expect((await report('forever')).json.revenue).toBe(400);
    expect((await report()).json.revenue).toBe(400);
  });
});

describe('analytics: items, categories and tables', () => {
  beforeEach(seedReportData);

  it('top items are ranked by revenue, from real order lines', async () => {
    expect((await report('week')).json.topItems).toEqual([
      { name: 'Dish A', orders: 3, revenue: 300 },
      { name: 'Dish A2', orders: 2, revenue: 100 },
    ]);
  });

  it('categories add up to the item revenue and carry a colour', async () => {
    const cats = (await report('week')).json.categoryBreakdown;
    expect(cats.map((c: { name: string; value: number }) => [c.name, c.value])).toEqual([['Category A', 300], ['Drinks', 100]]);
    expect(cats.every((c: { color: string }) => /^#[0-9A-F]{6}$/i.test(c.color))).toBe(true);
  });

  it('shows how many tables were used each day, and how many are in use right now', async () => {
    const r = (await report('week')).json;
    expect(r.occupancyData.map((p: { rate: number }) => p.rate)).toEqual([0, 0, 0, 0, 0, 50, 50]); // 1 of 2 tables on each of the last two days
    expect(r.occupancy).toBe(50);                                                                  // only table 2 has an order in progress
    expect(r.occupancyNote).toBe('1 of 2 tables in use now');
  });

  it('a restaurant with nothing yet gets zeros, not errors', async () => {
    await q(`delete from orders where tenant_id = '${A.tenant}'`);
    const r = (await report('week')).json;
    expect(r).toMatchObject({ revenue: 0, guests: 0, avgOrderValue: 0, revenueChange: null, topItems: [], categoryBreakdown: [] });
    expect(r.revenueData).toHaveLength(7);
  });
});

describe('analytics: who can see it, and whose numbers', () => {
  beforeEach(seedReportData);

  it('never includes another tenant\'s orders, and that tenant sees its own', async () => {
    expect((await report('week')).json.revenue).toBe(400);              // not 400 + 99,999
    expect((await report('week', 'ownerB')).json.revenue).toBe(99999);
  });

  it.each([['waiterA'], ['kitchenA'], ['frontA']] as [Persona][])('is refused for %s', async (who) => {
    expect((await report('week', who)).status).toBe(403);
  });
  it('is open to managers', async () => { expect((await report('week', 'managerA')).status).toBe(200); });
  it('requires a login', async () => { loginAs(null); expect((await call(analytics.GET, 'GET', '/api/analytics')).status).toBe(401); });
});

describe('periods', () => {
  it('build the right windows in the restaurant\'s time zone', () => {
    const now = new Date('2026-10-29T20:00:00Z');
    const week = buildPeriod('week', 'Asia/Kolkata', now);
    expect(week.start.toISOString()).toBe('2026-10-23T18:30:00.000Z');   // midnight at the start of 24 October, India
    expect(week.end.toISOString()).toBe('2026-10-30T18:30:00.000Z');     // the end of 30 October
    expect(week.prevEnd.toISOString()).toBe(week.start.toISOString());   // the previous period ends exactly where this one starts
    expect((week.start.getTime() - week.prevStart.getTime()) / 86_400_000).toBe(7);
    expect(buildPeriod('day', 'Asia/Kolkata', now).buckets).toHaveLength(24);
    expect(buildPeriod('month', 'Asia/Kolkata', now).buckets).toHaveLength(30);
    expect(buildPeriod('year', 'Asia/Kolkata', now).buckets).toHaveLength(12);
  });

  it('give the same week a different window in another zone', () => {
    const now = new Date('2026-10-29T20:00:00Z');
    expect(buildPeriod('week', 'UTC', now).buckets.at(-1)!.key).toBe('2026-10-29'); // still the 29th in UTC
    expect(buildPeriod('week', 'Asia/Kolkata', now).buckets.at(-1)!.key).toBe('2026-10-30');
  });

  it('describe a change in words, or say nothing when there is nothing to compare', () => {
    expect(changeText(150, 100)).toBe('+50.0% vs previous period');
    expect(changeText(50, 100)).toBe('−50.0% vs previous period');
    expect(changeText(0, 100)).toBe('−100.0% vs previous period');
    expect(changeText(100, 0)).toBeNull();
  });
});

describe('dashboard overview', () => {
  const stats = async (who: Persona = 'ownerA') => { loginAs(who); return (await call(dashboard.GET, 'GET', '/api/dashboard/stats')); };

  beforeEach(async () => {
    await seedReportData();
    // money collected: 22:30 yesterday, 00:30 today, and one from last month
    for (const [at, amt] of [['2026-10-29T17:00:00Z', 500], ['2026-10-29T19:00:00Z', 700], ['2026-10-20T00:00:00Z', 900]]) {
      await q(`insert into payments (tenant_id, bill_id, amount, method, created_at) values ('${A.tenant}', '${A.bill}', '${amt}', 'cash', '${at}')`);
    }
    await q(`insert into payments (tenant_id, bill_id, amount, method, created_at) values ('${B.tenant}', '${B.bill}', '88888', 'cash', '2026-10-29T19:00:00Z')`);
  });

  it('revenue is money collected: today starts at local midnight, this week is the last 7 days', async () => {
    const r = (await stats()).json;
    expect(r.todayRevenue).toBe(700);
    expect(r.weekRevenue).toBe(1200);   // 500 + 700; the 900 is older than 7 days
  });

  it('is not inflated by cancelled orders or by another tenant\'s payments', async () => {
    const r = (await stats()).json;
    expect(r.todayRevenue).not.toBeGreaterThan(700);
    expect((await stats('ownerB')).json.todayRevenue).toBe(88888);
  });

  it('counts orders in progress, and arrivals and departures for the restaurant\'s today, ignoring cancelled bookings', async () => {
    const room = async (n: number) => { await q(`insert into rooms (id, tenant_id, property_id, room_type_id, room_number, status) values ('${u(n)}', '${A.tenant}', '${A.property}', '${A.roomType}', '${n}', '${n === 970 ? 'occupied' : 'available'}')`); return u(n); };
    const booking = async (n: number, room: string, from: string, to: string, status: string) =>
      q(`insert into bookings (id, tenant_id, property_id, room_id, guest_id, check_in_date, check_out_date, status, total_amount) values ('${u(n)}', '${A.tenant}', '${A.property}', '${room}', '${A.guest}', '${from}', '${to}', '${status}', '1')`);
    const r1 = await room(970), r2 = await room(971), r3 = await room(972);
    await booking(980, r1, '2026-10-30T08:30:00Z', '2026-11-01T05:30:00Z', 'confirmed');   // arrives 14:00 today (India)
    await booking(981, r2, '2026-10-30T08:30:00Z', '2026-11-01T05:30:00Z', 'cancelled');   // cancelled arrival: ignored
    await booking(982, r3, '2026-10-27T08:30:00Z', '2026-10-30T05:30:00Z', 'checked_in');  // leaves 11:00 today

    const r = (await stats()).json;
    expect(r.activeOrders).toBe(1);               // only the order being prepared
    expect(r.todayCheckIns).toBe(1);
    expect(r.todayCheckOuts).toBe(1);
    expect(r.arrivals).toHaveLength(1);
    expect(r.arrivals[0].guest.name).toBe('Guest A');
    expect(r.totalRooms).toBe(4);                 // the seeded room plus three
    expect(r.occupiedRooms).toBe(1);
    expect(r.occupancyRate).toBe(25);
    expect(r.hasProperties).toBe(true);
  });

  it('lists the newest orders first, only this tenant\'s', async () => {
    const r = (await stats()).json;
    expect(r.recentOrders.map((o: { id: string }) => o.id).slice(0, 3)).toEqual([u(962), u(961), u(960)]);
    expect(r.recentOrders.every((o: { tenantId: string }) => o.tenantId === A.tenant)).toBe(true);
  });

  it('a tenant with no property yet gets an empty overview', async () => {
    await q(`delete from payments where tenant_id = '${A.tenant}'`); await q(`delete from bills where tenant_id = '${A.tenant}'`);
    await q(`delete from order_items where tenant_id = '${A.tenant}'`); await q(`delete from orders where tenant_id = '${A.tenant}'`);
    await q(`delete from bookings where tenant_id = '${A.tenant}'`); await q(`delete from rooms where tenant_id = '${A.tenant}'`);
    await q(`delete from tables where tenant_id = '${A.tenant}'`); await q(`delete from menu_items where tenant_id = '${A.tenant}'`);
    await q(`delete from menu_categories where tenant_id = '${A.tenant}'`); await q(`delete from room_types where tenant_id = '${A.tenant}'`);
    await q(`delete from staff where tenant_id = '${A.tenant}'`); await q(`delete from outlets where tenant_id = '${A.tenant}'`);
    await q(`delete from properties where tenant_id = '${A.tenant}'`);
    const r = (await stats()).json;
    expect(r).toMatchObject({ hasProperties: false, todayRevenue: 0, activeOrders: 0, arrivals: [] });
  });
});
