import { beforeEach, describe, expect, it } from 'vitest';
import * as categories from '@/app/api/menu-categories/route';
import * as orders from '@/app/api/orders/route';
import * as tables from '@/app/api/tables/route';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BAR = uuid(701), BAR_CATEGORY = uuid(702), BAR_ITEM = uuid(703), BAR_TABLE = uuid(704);

// Tenant A runs two outlets: the seeded restaurant and a rooftop bar with its own menu and tables.
beforeEach(async () => {
  await resetAndSeed();
  await q(`insert into outlets (id, tenant_id, property_id, name, slug) values ('${BAR}', '${A.tenant}', '${A.property}', 'Rooftop Bar', 'rooftop-bar')`);
  await q(`insert into menu_categories (id, tenant_id, outlet_id, name) values ('${BAR_CATEGORY}', '${A.tenant}', '${BAR}', 'Drinks')`);
  await q(`insert into menu_items (id, tenant_id, outlet_id, category_id, name, price) values ('${BAR_ITEM}', '${A.tenant}', '${BAR}', '${BAR_CATEGORY}', 'Lime soda', '80.00')`);
  await q(`insert into tables (id, tenant_id, outlet_id, table_number) values ('${BAR_TABLE}', '${A.tenant}', '${BAR}', 'R1')`);
  loginAs('ownerA');
});

const order = (body: Record<string, unknown>) => call(orders.POST, 'POST', '/api/orders', { body });
const outletOf = async (orderId: string) => (await q<{ outlet_id: string }>(`select outlet_id from orders where id = '${orderId}'`))[0].outlet_id;

describe('an order goes to the right outlet, not just the first one', () => {
  it('room service (no table) goes to the outlet the dishes are from', async () => {
    const bar = await order({ roomId: A.room, items: [{ menuItemId: BAR_ITEM, quantity: 2 }] });
    expect(bar.status).toBe(200);
    expect(await outletOf(bar.json.orderId)).toBe(BAR);
    const kitchen = await order({ roomId: A.room, items: [{ menuItemId: A.item, quantity: 1 }] });
    expect(await outletOf(kitchen.json.orderId)).toBe(A.outlet);
  });

  it('a table fixes the outlet, and dishes from the other outlet are refused', async () => {
    const ok = await order({ tableId: BAR_TABLE, items: [{ menuItemId: BAR_ITEM, quantity: 1 }] });
    expect(await outletOf(ok.json.orderId)).toBe(BAR);
    expect((await order({ tableId: BAR_TABLE, items: [{ menuItemId: A.item, quantity: 1 }] })).status).toBe(400);
  });

  it('one order cannot mix dishes from two outlets, and an outlet named in the request must match the dishes', async () => {
    expect((await order({ items: [{ menuItemId: A.item, quantity: 1 }, { menuItemId: BAR_ITEM, quantity: 1 }] })).status).toBe(400);
    expect((await order({ outletId: A.outlet, items: [{ menuItemId: BAR_ITEM, quantity: 1 }] })).status).toBe(400);
    expect((await order({ outletId: BAR, items: [{ menuItemId: BAR_ITEM, quantity: 1 }] })).status).toBe(200);
    expect((await order({ outletId: B.outlet, items: [{ menuItemId: BAR_ITEM, quantity: 1 }] })).status).toBe(404);
    expect((await q(`select id from orders where tenant_id = '${A.tenant}'`)).length).toBe(2); // the seeded one and the one that worked
  });
});

describe('tables and menu sections can be added to a chosen outlet', () => {
  it('a table made for the bar gets the bar\'s QR link; with no outlet named it goes to the first outlet as before', async () => {
    const bar = await call(tables.POST, 'POST', '/api/tables', { body: { tableNumber: 'R2', outletId: BAR } });
    expect(bar.status).toBe(201);
    expect(bar.json).toMatchObject({ outletId: BAR, qrCode: `/menu/rooftop-bar/${bar.json.id}` });
    const first = await call(tables.POST, 'POST', '/api/tables', { body: { tableNumber: 'T9' } });
    expect(first.json.outletId).toBe(A.outlet);
  });

  it('the same table number can exist in both outlets', async () => {
    expect((await call(tables.POST, 'POST', '/api/tables', { body: { tableNumber: 'T-A', outletId: BAR } })).status).toBe(201);
    expect((await call(tables.POST, 'POST', '/api/tables', { body: { tableNumber: 'T-A' } })).status).toBe(409); // already in the first outlet
  });

  it('a menu section can be added to the bar', async () => {
    const r = await call(categories.POST, 'POST', '/api/menu-categories', { body: { name: 'Snacks', outletId: BAR } });
    expect(r.json.category.outletId).toBe(BAR);
  });

  it('another business\'s outlet is refused, and nothing is created', async () => {
    expect((await call(tables.POST, 'POST', '/api/tables', { body: { tableNumber: 'X1', outletId: B.outlet } })).status).toBe(404);
    expect((await call(categories.POST, 'POST', '/api/menu-categories', { body: { name: 'X', outletId: B.outlet } })).status).toBe(404);
    expect(await q(`select id from tables where table_number = 'X1'`)).toEqual([]);
    expect(await q(`select id from menu_categories where name = 'X'`)).toEqual([]);
  });
});
