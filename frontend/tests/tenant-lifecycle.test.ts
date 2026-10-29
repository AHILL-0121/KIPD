import { beforeEach, describe, expect, it } from 'vitest';
import * as menu from '@/app/api/menu/route';
import * as orders from '@/app/api/orders/route';
import * as adminTenants from '@/app/api/admin/tenants/route';
import * as adminTenant from '@/app/api/admin/tenants/[id]/route';
import * as adminStats from '@/app/api/admin/stats/route';
import { call, ids, loginAs, q, resetAndSeed, type Persona } from './helpers/harness';

const A = ids.A, B = ids.B;
const g = globalThis as unknown as { __user?: string | null; __clerk: Record<string, unknown>; authCache?: Map<string, unknown> };

const setStatus = (tenant: string, action: string) =>
  call(adminTenant.PATCH, 'PATCH', `/api/admin/tenants/${tenant}`, { params: { id: tenant }, body: { action } });

beforeEach(resetAndSeed);

describe('suspending a tenant', () => {
  it('blocks every member of that tenant, immediately, and only that tenant', async () => {
    loginAs('platformAdmin');
    expect((await setStatus(A.tenant, 'suspend')).status).toBe(200);

    for (const who of ['ownerA', 'managerA', 'waiterA', 'kitchenA'] as Persona[]) {
      loginAs(who);
      const r = await call(menu.GET, 'GET', '/api/menu');
      expect(r.status, who).toBe(403);
      expect(r.json.error).toMatch(/suspended/i);
    }
    loginAs('ownerB');
    expect((await call(menu.GET, 'GET', '/api/menu')).status).toBe(200); // other tenants unaffected
    loginAs('platformAdmin');
    expect((await call(adminTenants.GET, 'GET', '/api/admin/tenants')).status).toBe(200); // admins unaffected
  });

  it('can be undone', async () => {
    loginAs('platformAdmin');
    await setStatus(A.tenant, 'suspend');
    await setStatus(A.tenant, 'activate');
    loginAs('ownerA');
    expect((await call(menu.GET, 'GET', '/api/menu')).status).toBe(200);
  });

  it('is recorded in the audit log', async () => {
    loginAs('platformAdmin');
    await setStatus(A.tenant, 'suspend');
    await setStatus(A.tenant, 'activate');
    expect(await q(`select action, target_id from platform_audit_log order by created_at`)).toEqual([
      { action: 'tenant.suspend', target_id: A.tenant },
      { action: 'tenant.activate', target_id: A.tenant },
    ]);
  });

  it('only a platform admin can do it, with a valid action and a real tenant', async () => {
    loginAs('ownerA');
    expect((await setStatus(A.tenant, 'suspend')).status).toBe(403);
    loginAs('platformAdmin');
    expect((await setStatus(A.tenant, 'explode')).status).toBe(400);
    expect((await setStatus('00000000-0000-4000-8000-0000000fffff', 'suspend')).status).toBe(404);
    expect((await setStatus('not-a-uuid', 'suspend')).status).toBe(404);
  });
});

describe('deleting a tenant (soft delete)', () => {
  const del = (tenant: string) => call(adminTenant.DELETE, 'DELETE', `/api/admin/tenants/${tenant}`, { params: { id: tenant } });

  it('hides it and blocks access, but keeps every record', async () => {
    const counts = async () => (await q<{ n: number }>(`select (select count(*) from orders)::int + (select count(*) from bills)::int + (select count(*) from guests)::int as n`))[0].n;
    const before = await counts();

    loginAs('platformAdmin');
    expect((await del(A.tenant)).status).toBe(200);

    expect(await counts()).toBe(before); // nothing was removed
    expect((await q<{ deleted_at: Date | null; status: string }>(`select deleted_at, status from tenants where id = '${A.tenant}'`))[0].deleted_at).not.toBeNull();

    const list = await call(adminTenants.GET, 'GET', '/api/admin/tenants');
    expect(list.json.map((t: { id: string }) => t.id)).toEqual([B.tenant]);

    loginAs('ownerA');
    const r = await call(orders.GET, 'GET', '/api/orders');
    expect(r.status).toBe(403);
    expect(r.json.error).toMatch(/no longer exists/i);
  });

  it('is audited', async () => {
    loginAs('platformAdmin');
    await del(A.tenant);
    expect(await q(`select action from platform_audit_log`)).toEqual([{ action: 'tenant.delete' }]);
  });
});

describe('a login that points at a tenant that does not exist (for example after a database reset)', () => {
  it('is refused cleanly with 403, not a crash', async () => {
    g.__clerk['user_stale'] = { publicMetadata: { tenant_id: '00000000-0000-4000-8000-0000000fffff' }, firstName: 'S', lastName: 'T', emailAddresses: [] };
    g.__user = 'user_stale';
    g.authCache?.clear();
    const r = await call(menu.GET, 'GET', '/api/menu');
    expect(r.status).toBe(403);
    expect(r.json.error).toMatch(/no longer exists/i);
  });

  it('is also refused if the stored tenant id is not even a valid id', async () => {
    g.__clerk['user_garbage'] = { publicMetadata: { tenant_id: 'tenant-1' }, firstName: 'S', lastName: 'T', emailAddresses: [] };
    g.__user = 'user_garbage';
    g.authCache?.clear();
    expect((await call(menu.GET, 'GET', '/api/menu')).status).toBe(403);
  });
});

describe('platform statistics', () => {
  const stats = async () => { loginAs('platformAdmin'); return (await call(adminStats.GET, 'GET', '/api/admin/stats')).json; };

  it('counts tenants and revenue by the real plan names', async () => {
    expect(await stats()).toEqual({ totalTenants: 2, activeTenants: 2, suspendedTenants: 0, mrr: 98 }); // 2 x basic (49)

    await q(`update tenants set plan = 'pro' where id = '${B.tenant}'`);
    expect((await stats()).mrr).toBe(49 + 149);
    await q(`update tenants set plan = 'enterprise' where id = '${A.tenant}'`);
    expect((await stats()).mrr).toBe(399 + 149);
  });

  it('suspended tenants do not count as revenue, and deleted tenants are ignored entirely', async () => {
    await q(`update tenants set status = 'suspended' where id = '${B.tenant}'`);
    expect(await stats()).toEqual({ totalTenants: 2, activeTenants: 1, suspendedTenants: 1, mrr: 49 });
    await q(`update tenants set deleted_at = now() where id = '${A.tenant}'`);
    expect(await stats()).toEqual({ totalTenants: 1, activeTenants: 0, suspendedTenants: 1, mrr: 0 });
  });

  it('the database only accepts the three plan names', async () => {
    await expect(q(`update tenants set plan = 'standard' where id = '${A.tenant}'`)).rejects.toThrow();
  });
});

describe('creating a tenant with a time zone', () => {
  const create = (over: object = {}) => call(adminTenants.POST, 'POST', '/api/admin/tenants', { body: { name: 'Lake View', slug: 'lake-view', ownerEmail: 'o@lake.test', ...over } });

  it('defaults to India Standard Time, accepts a real zone, and rejects an unknown one', async () => {
    loginAs('platformAdmin');
    expect((await create()).status).toBe(200);
    expect((await create({ slug: 'lake-view-2', timezone: 'America/New_York' })).status).toBe(200);
    expect((await create({ slug: 'lake-view-3', timezone: 'Mars/Olympus' })).status).toBe(400);
    expect(await q(`select slug, timezone from tenants where slug like 'lake-view%' order by slug`)).toEqual([
      { slug: 'lake-view', timezone: 'Asia/Kolkata' },
      { slug: 'lake-view-2', timezone: 'America/New_York' },
    ]);
  });

  it('gives the new tenant its own property and outlet, all carrying the tenant id', async () => {
    loginAs('platformAdmin');
    await create();
    const [t] = await q<{ id: string }>(`select id from tenants where slug = 'lake-view'`);
    expect(await q(`select tenant_id from properties where tenant_id = '${t.id}'`)).toHaveLength(1);
    expect(await q(`select slug, tenant_id from outlets where tenant_id = '${t.id}'`)).toEqual([{ slug: 'lake-view-restaurant', tenant_id: t.id }]);
  });
});
