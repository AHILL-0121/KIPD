import { beforeEach, describe, expect, it } from 'vitest';
import * as adminMaintenance from '@/app/api/admin/maintenance/route';
import * as adminTenant from '@/app/api/admin/tenants/[id]/route';
import * as adminTenants from '@/app/api/admin/tenants/route';
import * as adminUsers from '@/app/api/admin/users/route';
import * as categories from '@/app/api/menu-categories/route';
import * as menu from '@/app/api/menu/route';
import * as orders from '@/app/api/orders/route';
import * as outlets from '@/app/api/outlets/route';
import * as maintenance from '@/app/api/maintenance/route';
import * as rooms from '@/app/api/rooms/route';
import * as staffDirect from '@/app/api/staff/direct/route';
import * as tables from '@/app/api/tables/route';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(resetAndSeed);

describe('plan quota enforcement and outlet management', () => {
  it('enforces the basic plan outlet cap and unlocks on upgrade to pro', async () => {
    loginAs('ownerA');
    const blocked = await call(outlets.POST, 'POST', '/api/outlets', {
      body: { name: 'Sky Lounge', type: 'bar' },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error).toMatch(/basic plan allows up to 1 outlets/i);

    loginAs('platformAdmin');
    const upgraded = await call(adminTenant.PATCH, 'PATCH', `/api/admin/tenants/${A.tenant}`, {
      params: { id: A.tenant },
      body: { plan: 'pro' },
    });
    expect(upgraded.status).toBe(200);
    expect(upgraded.json.tenant.plan).toBe('pro');

    loginAs('ownerA');
    const created = await call(outlets.POST, 'POST', '/api/outlets', {
      body: { name: 'Sky Lounge', type: 'bar' },
    });
    expect(created.status).toBe(201);
    expect(created.json.outlet.name).toBe('Sky Lounge');

    // Cannot delete the original outlet if only one exists after deleting the new one
    const delNew = await call(outlets.DELETE, 'DELETE', `/api/outlets?id=${created.json.outlet.id}`);
    expect(delNew.status).toBe(200);

    const delLast = await call(outlets.DELETE, 'DELETE', `/api/outlets?id=${A.outlet}`);
    expect(delLast.status).toBe(409);
  });

  it('enforces room, table, and staff caps on the basic plan', async () => {
    // Tenant A already has 1 room, 1 table, and 4 seeded staff rows
    for (let i = 2; i <= 15; i++) {
      await q(
        `insert into rooms (id, tenant_id, property_id, room_type_id, room_number) values ('${uuid(800 + i)}', '${A.tenant}', '${A.property}', '${A.roomType}', 'R-${i}')`,
      );
      await q(
        `insert into tables (id, tenant_id, outlet_id, table_number) values ('${uuid(900 + i)}', '${A.tenant}', '${A.outlet}', 'T-${i}')`,
      );
    }
    for (let i = 1; i <= 6; i++) {
      await q(
        `insert into staff (id, tenant_id, clerk_id, name, email, role) values ('${uuid(950 + i)}', '${A.tenant}', 'clerk_cap_${i}', 'Cap ${i}', 'cap${i}@a.test', 'waiter')`,
      );
    }

    loginAs('ownerA');
    const roomRes = await call(rooms.POST, 'POST', '/api/rooms', {
      body: { roomNumber: '999', roomTypeId: A.roomType },
    });
    expect(roomRes.status).toBe(403);
    expect(roomRes.json.error).toMatch(/15 rooms/i);

    const tableRes = await call(tables.POST, 'POST', '/api/tables', {
      body: { tableNumber: 'T-99' },
    });
    expect(tableRes.status).toBe(403);
    expect(tableRes.json.error).toMatch(/15 tables/i);

    const staffRes = await call(staffDirect.POST, 'POST', '/api/staff/direct', {
      body: { name: 'Extra', email: 'extra@a.test', role: 'waiter', password: 'a-long-password-1' },
    });
    expect(staffRes.status).toBe(403);
    expect(staffRes.json.error).toMatch(/10 team members/i);
  });
});

describe('admin pagination and search', () => {
  it('paginates /api/admin/tenants when page/limit are provided and preserves array when omitted', async () => {
    loginAs('platformAdmin');

    const unpaginated = await call(adminTenants.GET, 'GET', '/api/admin/tenants');
    expect(unpaginated.status).toBe(200);
    expect(Array.isArray(unpaginated.json)).toBe(true);
    expect(unpaginated.json.length).toBe(2);

    const paged = await call(adminTenants.GET, 'GET', '/api/admin/tenants?page=1&limit=1');
    expect(paged.status).toBe(200);
    expect(paged.json.items.length).toBe(1);
    expect(paged.json.total).toBe(2);
    expect(paged.json.totalPages).toBe(2);

    const target = unpaginated.json.find((t: { id: string }) => t.id === A.tenant);
    const filtered = await call(adminTenants.GET, 'GET', `/api/admin/tenants?page=1&limit=10&search=${encodeURIComponent(target.slug)}`);
    expect(filtered.status).toBe(200);
    expect(filtered.json.items.map((t: { id: string }) => t.id)).toEqual([A.tenant]);
  });

  it('paginates /api/admin/users for platform admins and rejects non-admins with 403', async () => {
    loginAs('ownerA');
    expect((await call(adminUsers.GET, 'GET', '/api/admin/users?page=1&limit=1')).status).toBe(403);

    loginAs('platformAdmin');
    const paged = await call(adminUsers.GET, 'GET', '/api/admin/users?page=1&limit=2');
    expect(paged.status).toBe(200);
    expect(Array.isArray(paged.json.items)).toBe(true);
    expect(paged.json.page).toBe(1);
    expect(paged.json.pageSize).toBe(2);
  });
});

describe('platform maintenance mode', () => {
  it('persists toggle state, logs audit entries, and restricts mutations to platform admins', async () => {
    loginAs(null);
    const initial = await maintenance.GET();
    expect(initial.status).toBe(200);
    expect((await initial.json()).enabled).toBe(false);

    loginAs('ownerA');
    expect(
      (await call(adminMaintenance.PATCH, 'PATCH', '/api/admin/maintenance', { body: { enabled: true } })).status,
    ).toBe(403);

    loginAs('platformAdmin');
    const enabled = await call(adminMaintenance.PATCH, 'PATCH', '/api/admin/maintenance', {
      body: { enabled: true, message: 'Upgrading DB', estimatedEnd: '10 mins' },
    });
    expect(enabled.status).toBe(200);
    expect(enabled.json.enabled).toBe(true);

    const pub = await (await maintenance.GET()).json();
    expect(pub).toMatchObject({ enabled: true, message: 'Upgrading DB', estimatedEnd: '10 mins' });

    const audit = await q<{ action: string }>(`select action from platform_audit_log order by created_at desc limit 1`);
    expect(audit[0]?.action).toBe('platform.maintenance_enable');
  });
});

describe('multi-outlet GET filtering', () => {
  it('scopes tables, categories, menu items, and orders by ?outletId= and rejects cross-tenant outlets', async () => {
    const BAR = uuid(771), BAR_CAT = uuid(772), BAR_ITEM = uuid(773), BAR_TABLE = uuid(774), BAR_ORDER = uuid(775);
    await q(`insert into outlets (id, tenant_id, property_id, name, slug) values ('${BAR}', '${A.tenant}', '${A.property}', 'Pool Bar', 'pool-bar')`);
    await q(`insert into menu_categories (id, tenant_id, outlet_id, name) values ('${BAR_CAT}', '${A.tenant}', '${BAR}', 'Cocktails')`);
    await q(`insert into menu_items (id, tenant_id, outlet_id, category_id, name, price) values ('${BAR_ITEM}', '${A.tenant}', '${BAR}', '${BAR_CAT}', 'Mojito', '250.00')`);
    await q(`insert into tables (id, tenant_id, outlet_id, table_number) values ('${BAR_TABLE}', '${A.tenant}', '${BAR}', 'P1')`);
    await q(`insert into orders (id, tenant_id, outlet_id, table_id, type, status, total_amount) values ('${BAR_ORDER}', '${A.tenant}', '${BAR}', '${BAR_TABLE}', 'dine_in', 'new', '250.00')`);

    loginAs('ownerA');
    const tBar = await call(tables.GET, 'GET', `/api/tables?outletId=${BAR}`);
    expect(tBar.status).toBe(200);
    expect(tBar.json.map((t: { tableNumber: string }) => t.tableNumber)).toEqual(['P1']);

    const cBar = await call(categories.GET, 'GET', `/api/menu-categories?outletId=${BAR}`);
    expect(cBar.status).toBe(200);
    expect(cBar.json.map((c: { name: string }) => c.name)).toEqual(['Cocktails']);

    const mBar = await call(menu.GET, 'GET', `/api/menu?outletId=${BAR}`);
    expect(mBar.status).toBe(200);
    expect(mBar.json.map((m: { name: string }) => m.name)).toEqual(['Mojito']);

    const oBar = await call(orders.GET, 'GET', `/api/orders?outletId=${BAR}`);
    expect(oBar.status).toBe(200);
    expect(oBar.json.map((o: { id: string }) => o.id)).toEqual([BAR_ORDER]);

    // Cross-tenant outletId is rejected
    expect((await call(tables.GET, 'GET', `/api/tables?outletId=${B.outlet}`)).status).toBe(404);
  });
});
