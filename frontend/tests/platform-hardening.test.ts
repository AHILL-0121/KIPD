import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminTenants from '@/app/api/admin/tenants/route';
import * as contact from '@/app/api/contact-admin/route';
import * as health from '@/app/api/health/route';
import { sendEmail } from '@/lib/email';
import { ORDER_STATUSES, ORDER_STATUS, ORDER_STATUS_INPUT } from '@/lib/order-status';
import { resetRateLimits } from '@/lib/rate-limit';
import { testDb } from './helpers/db';
import { call, loginAs, personas, q, resetAndSeed } from './helpers/harness';

const g = globalThis as unknown as { __clerk: Record<string, unknown> };

beforeEach(async () => {
  await resetAndSeed();
  resetRateLimits();
  vi.mocked(sendEmail).mockClear();
  process.env.CONTACT_ADMIN_EMAIL = 'admin@kipd.test';
});
afterEach(() => {
  delete process.env.CONTACT_ADMIN_EMAIL;
  delete g.__clerk[personas.platformAdmin];
});

describe('the health check', () => {
  it('answers 200 while the database answers, and says nothing else', async () => {
    const res = await health.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['database', 'ms', 'status']);
    expect(body).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('answers 503, without the error text, when the database does not', async () => {
    const spy = vi.spyOn(testDb, 'execute').mockRejectedValueOnce(new Error('password authentication failed for user "neondb_owner"'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await health.GET();
    spy.mockRestore(); quiet.mockRestore();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/password|neondb/);
  });
});

describe('the "request access" form (open to signed-out visitors)', () => {
  const send = (ip = '203.0.113.7', body: Record<string, unknown> = { name: 'Asha', email: 'asha@example.com', company: 'Orchid Bay', message: 'Hello' }) =>
    contact.POST(new NextRequest('http://localhost/api/contact-admin', {
      method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    }));

  it('works without a login and emails the platform admin', async () => {
    loginAs(null);
    expect((await send()).status).toBe(200);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ to: 'admin@kipd.test' });
  });

  it('lets one caller send 3 in ten minutes, then answers 429 and sends no more email', async () => {
    loginAs(null);
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200);
    const fourth = await send();
    expect(fourth.status).toBe(429);
    expect(fourth.headers.get('Retry-After')).toBeTruthy();
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(3);
    // Someone else is not affected.
    expect((await send('198.51.100.9')).status).toBe(200);
  });

  it('a refused (invalid) request still counts, so the form cannot be used to probe quickly', async () => {
    loginAs(null);
    for (let i = 0; i < 3; i++) expect((await send('203.0.113.8', { name: '' })).status).toBe(400);
    expect((await send('203.0.113.8')).status).toBe(429);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

describe('the platform admin check is remembered for a minute', () => {
  const admin = { publicMetadata: { platform_admin: true }, firstName: 'Plat', lastName: 'Admin', emailAddresses: [] };
  const list = () => call(adminTenants.GET, 'GET', '/api/admin/tenants');

  it('a confirmed admin is not looked up again on the next request', async () => {
    let lookups = 0;
    Object.defineProperty(g.__clerk, personas.platformAdmin, { configurable: true, enumerable: true, get: () => { lookups++; return admin; } });
    loginAs('platformAdmin');
    expect((await list()).status).toBe(200);
    expect((await list()).status).toBe(200);
    expect(lookups).toBe(1);
  });

  it('a refusal is never remembered: someone who is not an admin is checked every time', async () => {
    loginAs('ownerA');
    expect((await list()).status).toBe(403);
    expect((await list()).status).toBe(403);
    // ...and being signed in as an admin a moment ago does not help a different person.
    g.__clerk[personas.platformAdmin] = admin;
    loginAs('platformAdmin');
    expect((await list()).status).toBe(200);
    loginAs('waiterA');
    expect((await list()).status).toBe(403);
    loginAs(null);
    expect((await list()).status).toBe(401);
  });
});

describe('one order-status vocabulary', () => {
  it('matches what the database accepts', async () => {
    const [row] = await q<{ def: string }>(`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'orders'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%'`);
    const inDatabase = Array.from(row.def.matchAll(/'([a-z_]+)'/g), (m) => m[1]).sort();
    expect(inDatabase).toEqual([...ORDER_STATUSES].sort());
  });

  it('every status has a label, and a person can set all of them except "closed" (the bill does that)', () => {
    for (const s of ORDER_STATUSES) expect(ORDER_STATUS[s]).toBeDefined();
    expect(ORDER_STATUSES.filter((s) => !(ORDER_STATUS_INPUT as readonly string[]).includes(s))).toEqual(['closed']);
  });
});
