import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as billing from '@/app/api/billing/route';
import * as settle from '@/app/api/orders/settle-tab/route';
import * as orderById from '@/app/api/orders/[id]/route';
import * as kds from '@/app/api/kds/[outletId]/route';
import * as notification from '@/app/api/payments/notification-match/route';
import * as appSettings from '@/app/api/settings/route';
import * as paySettings from '@/app/api/settings/payments/route';
import * as account from '@/app/api/settings/payments/razorpay/route';
import * as webhook from '@/app/api/webhooks/razorpay/[tenantId]/route';
import { getRazorpayAccount } from '@/lib/razorpay-account';
import { open, seal } from '@/lib/secret-box';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
const KEYS = { keyId: 'rzp_live_AbC123xyz', keySecret: 'the-real-key-secret-A' };

/** Razorpay's API as the server sees it: `keysOk` decides whether the key check passes. */
function razorpay(keysOk: boolean | 'offline' = true) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/payments?count=1')) {
      if (keysOk === 'offline') throw new Error('offline');
      return new Response(keysOk ? '{"items":[]}' : '{"error":{"description":"Authentication failed"}}', { status: keysOk ? 200 : 401 });
    }
    return new Response(JSON.stringify({ id: 'plink_1', short_url: 'https://rzp.io/i/x' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(async () => {
  await resetAndSeed();
  process.env.PAYMENT_KEYS_SECRET = 'unit-test-secret-that-is-at-least-32-chars-long';
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.PAYMENT_KEYS_SECRET; });

const getAccount = () => call(account.GET, 'GET', '/api/settings/payments/razorpay');
const putKeys = (body: unknown = KEYS) => call(account.PUT, 'PUT', '/api/settings/payments/razorpay', { body });
const newSecret = () => call(account.POST, 'POST', '/api/settings/payments/razorpay');
const remove = () => call(account.DELETE, 'DELETE', '/api/settings/payments/razorpay');
const stored = (tenantId: string) => q<{ key_id: string; key_secret_enc: string; webhook_secret_enc: string | null }>(`select * from razorpay_accounts where tenant_id = '${tenantId}'`);

const paidEvent = (billId: string, tenantId: string, paymentId: string, amountPaise: number) => ({
  event: 'payment_link.paid',
  payload: { payment_link: { entity: { id: 'plink_1', notes: { billId, tenantId } } }, payment: { entity: { id: paymentId, amount: amountPaise, status: 'captured' } } },
});
const deliver = (tenantId: string, secret: string, body: unknown) => {
  const raw = JSON.stringify(body);
  return webhook.POST(new NextRequest(`http://localhost/api/webhooks/razorpay/${tenantId}`, {
    method: 'POST', body: raw, headers: { 'x-razorpay-signature': createHmac('sha256', secret).update(raw).digest('hex') },
  }), { params: { tenantId } });
};

describe('connecting a business\'s own Razorpay account', () => {
  it('the owner connects with keys Razorpay accepts; the secret is stored encrypted and never comes back', async () => {
    const api = razorpay();
    loginAs('ownerA');
    expect((await getAccount()).json).toMatchObject({ connected: false, keyId: null, mode: null, webhookReady: false });

    const r = await putKeys();
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ connected: true, keyId: KEYS.keyId, mode: 'live', webhookReady: true });
    expect(r.json.webhookUrl).toBe(`https://kipd.test/api/webhooks/razorpay/${A.tenant}`);
    expect(typeof r.json.webhookSecret).toBe('string'); // shown once, now
    expect(r.json.webhookSecret.length).toBeGreaterThanOrEqual(40);
    expect(JSON.stringify(r.json)).not.toContain(KEYS.keySecret);

    // Razorpay was asked with exactly these keys before anything was saved
    const [, init] = api.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${KEYS.keyId}:${KEYS.keySecret}`).toString('base64')}`);

    // in the database: no plain secret anywhere
    const [row] = await stored(A.tenant);
    expect(row.key_id).toBe(KEYS.keyId);
    expect(JSON.stringify(row)).not.toContain(KEYS.keySecret);
    expect(JSON.stringify(row)).not.toContain(r.json.webhookSecret);
    expect(row.key_secret_enc).toMatch(/^v1\./);

    // reading the connection again never returns either secret
    const again = await getAccount();
    expect(again.json.webhookSecret).toBeUndefined();
    expect(JSON.stringify(again.json)).not.toContain(KEYS.keySecret);
    const settings = await call(paySettings.GET, 'GET', '/api/settings/payments');
    expect(settings.json.razorpayConfigured).toBe(true);
    expect(JSON.stringify(settings.json)).not.toMatch(/the-real-key-secret|v1\./);

    // and the server can use them
    expect(await getRazorpayAccount(A.tenant)).toMatchObject({ ...KEYS, webhookSecret: r.json.webhookSecret });
  });

  it('keys that Razorpay rejects, or cannot be checked, are never saved', async () => {
    loginAs('ownerA');
    razorpay(false);
    const rejected = await putKeys();
    expect(rejected.status).toBe(400);
    expect(rejected.json.error).toMatch(/did not accept these keys/);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    razorpay('offline');
    expect((await putKeys()).status).toBe(502);
    quiet.mockRestore();
    expect(await stored(A.tenant)).toEqual([]);
  });

  it('refuses malformed keys without asking Razorpay', async () => {
    const api = razorpay();
    loginAs('ownerA');
    for (const body of [{ keyId: 'sk_live_abc', keySecret: 'long-enough-secret' }, { keyId: 'rzp_live_abc', keySecret: '' }, { keyId: 'rzp_prod_abc', keySecret: 'long-enough-secret' }, {}]) {
      expect((await putKeys(body)).status).toBe(400);
    }
    expect(api).not.toHaveBeenCalled();
  });

  it('only the owner may connect, replace, re-secret or disconnect; a manager may not', async () => {
    razorpay();
    for (const who of ['managerA', 'frontA', 'waiterA', 'kitchenA'] as const) {
      loginAs(who);
      expect((await putKeys()).status).toBe(403);
      expect((await getAccount()).status).toBe(403);
      expect((await newSecret()).status).toBe(403);
      expect((await remove()).status).toBe(403);
    }
    loginAs(null);
    expect((await putKeys()).status).toBe(401);
    expect(await stored(A.tenant)).toEqual([]);
  });

  it('one business\'s connection is invisible to, and untouched by, another', async () => {
    razorpay();
    loginAs('ownerA');
    await putKeys();
    loginAs('ownerB');
    expect((await getAccount()).json).toMatchObject({ connected: false, keyId: null });
    expect((await remove()).status).toBe(200); // removes B's (nothing), not A's
    expect(await stored(A.tenant)).toHaveLength(1);
    await putKeys({ keyId: 'rzp_test_BusinessB', keySecret: 'the-real-key-secret-B' });
    expect((await getRazorpayAccount(A.tenant))?.keySecret).toBe(KEYS.keySecret);
    expect((await getRazorpayAccount(B.tenant))?.keySecret).toBe('the-real-key-secret-B');
  });

  it('replacing the keys keeps the webhook secret; a new secret replaces the old one at once', async () => {
    razorpay();
    loginAs('ownerA');
    const first = (await putKeys()).json.webhookSecret as string;
    const replaced = await putKeys({ keyId: 'rzp_live_Second999', keySecret: 'second-key-secret' });
    expect(replaced.json.webhookSecret).toBeUndefined(); // nothing to redo in Razorpay's dashboard
    expect((await getRazorpayAccount(A.tenant))).toMatchObject({ keyId: 'rzp_live_Second999', keySecret: 'second-key-secret', webhookSecret: first });

    expect((await deliver(A.tenant, first, paidEvent(A.bill, A.tenant, 'pay_1', 10000))).status).toBe(200);
    const second = (await newSecret()).json.webhookSecret as string;
    expect(second).not.toBe(first);
    expect((await deliver(A.tenant, first, paidEvent(A.bill, A.tenant, 'pay_2', 10000))).status).toBe(400); // old secret is dead
    expect((await deliver(A.tenant, second, paidEvent(A.bill, A.tenant, 'pay_2', 10000))).status).toBe(200);
    expect((await q<{ paid_amount: string }>(`select paid_amount from bills where id = '${A.bill}'`))[0].paid_amount).toBe('200.00');
  });

  it('a webhook secret cannot be made before keys are connected', async () => {
    loginAs('ownerA');
    expect((await newSecret()).status).toBe(409);
  });

  it('disconnecting deletes the keys, turns online payments off, and keeps payments already recorded', async () => {
    razorpay();
    loginAs('ownerA');
    const secret = (await putKeys()).json.webhookSecret as string;
    await call(paySettings.PUT, 'PUT', '/api/settings/payments', { body: { manualMethods: ['cash'], onlinePayments: true, depositPercent: 0 } });
    await deliver(A.tenant, secret, paidEvent(A.bill, A.tenant, 'pay_1', 10000));

    expect((await remove()).json).toMatchObject({ connected: false });
    expect(await stored(A.tenant)).toEqual([]);
    expect((await call(paySettings.GET, 'GET', '/api/settings/payments')).json.razorpayConfigured).toBe(false);
    expect((await call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId: A.bill, paymentMethod: 'razorpay', amount: 100 } })).status).toBe(503);
    expect((await deliver(A.tenant, secret, paidEvent(A.bill, A.tenant, 'pay_2', 10000))).status).toBe(400);
    expect(await q(`select razorpay_payment_id from payments where bill_id = '${A.bill}'`)).toEqual([{ razorpay_payment_id: 'pay_1' }]);
  });

  it('a payment link is created with the business\'s own keys', async () => {
    const api = razorpay();
    loginAs('ownerA');
    await putKeys();
    await call(paySettings.PUT, 'PUT', '/api/settings/payments', { body: { manualMethods: ['cash'], onlinePayments: true, depositPercent: 0 } });
    api.mockClear();
    loginAs('frontA');
    expect((await call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId: A.bill, paymentMethod: 'razorpay', amount: 100 } })).status).toBe(200);
    const [url, init] = api.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/payment_links');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${KEYS.keyId}:${KEYS.keySecret}`).toString('base64')}`);
  });
});

describe('the encryption itself', () => {
  it('round-trips, never repeats, and is tied to the business it was made for', () => {
    const one = seal('secret-value', A.tenant), two = seal('secret-value', A.tenant);
    expect(one).not.toBe(two); // a fresh random nonce each time
    expect(one).not.toContain('secret-value');
    expect(open(one, A.tenant)).toBe('secret-value');
    expect(open(one, B.tenant)).toBeNull(); // copied onto another business's row: will not open
    expect(open(one.slice(0, -2) + 'AA', A.tenant)).toBeNull(); // tampered
    expect(open('not-a-sealed-value', A.tenant)).toBeNull();
    expect(open(null, A.tenant)).toBeNull();
  });

  it('a different server secret cannot open stored keys; the business simply shows as not connected', async () => {
    razorpay();
    loginAs('ownerA');
    await putKeys();
    process.env.PAYMENT_KEYS_SECRET = 'a-completely-different-secret-of-32-chars!!';
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getRazorpayAccount(A.tenant)).toBeNull();
    expect((await call(paySettings.GET, 'GET', '/api/settings/payments')).json).toMatchObject({ razorpayConfigured: false });
    quiet.mockRestore();
  });

  it('without a server secret (or with a short one) keys cannot be saved, and nothing is stored in the clear', async () => {
    const api = razorpay();
    loginAs('ownerA');
    for (const value of [undefined, 'too-short']) {
      if (value === undefined) delete process.env.PAYMENT_KEYS_SECRET; else process.env.PAYMENT_KEYS_SECRET = value;
      const r = await putKeys();
      expect(r.status).toBe(503);
    }
    expect(api).not.toHaveBeenCalled();
    expect(await stored(A.tenant)).toEqual([]);
    expect(() => seal('x', A.tenant)).toThrow();
  });
});

describe('waiters: the kitchen board, not billing (decided 2026-11-14)', () => {
  it('a waiter can see and work the kitchen board, and close a table\'s tab', async () => {
    loginAs('waiterA');
    expect((await call(kds.GET, 'GET', `/api/kds/${A.outlet}`, { params: { outletId: A.outlet } })).status).toBe(200);
    expect((await call(orderById.PATCH, 'PATCH', `/api/orders/${A.order}`, { params: { id: A.order }, body: { status: 'preparing' } })).status).toBe(200);
    expect((await call(settle.POST, 'POST', '/api/orders/settle-tab', { body: { tableId: A.table } })).status).toBe(200);
  });

  it('a waiter cannot read bills, take payments, see payment settings or receipt settings, or match UPI payments', async () => {
    loginAs('waiterA');
    expect((await call(billing.GET, 'GET', '/api/billing')).status).toBe(403);
    expect((await call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId: A.bill, paymentMethod: 'cash' } })).status).toBe(403);
    expect((await call(paySettings.GET, 'GET', '/api/settings/payments')).status).toBe(403);
    expect((await call(appSettings.GET, 'GET', '/api/settings')).status).toBe(403);
    expect((await call(notification.POST, 'POST', '/api/payments/notification-match', { body: { amount: 100, packageName: 'com.phonepe.app' } })).status).toBe(403);
  });

  it('front desk still can', async () => {
    loginAs('frontA');
    expect((await call(billing.GET, 'GET', '/api/billing')).status).toBe(200);
    expect((await call(paySettings.GET, 'GET', '/api/settings/payments')).status).toBe(200);
    expect((await call(appSettings.GET, 'GET', '/api/settings')).status).toBe(200);
  });
});
