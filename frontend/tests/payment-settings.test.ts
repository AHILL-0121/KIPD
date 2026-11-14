import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as billing from '@/app/api/billing/route';
import * as settings from '@/app/api/settings/payments/route';
import * as webhook from '@/app/api/webhooks/razorpay/[tenantId]/route';
import { suggestedDeposit } from '@/lib/deposit';
import { parsePaymentSettings } from '@/lib/payment-settings';
import { verifyWebhookSignature } from '@/lib/razorpay';
import { saveRazorpayKeys } from '@/lib/razorpay-account';
import { seal } from '@/lib/secret-box';
import { razorpayAccounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { testDb } from './helpers/db';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A, B = ids.B;
const SECRET = 'whsec_test_secret';

/** Gives a business its own Razorpay account, as if its owner had connected it in Settings. */
async function connect(tenantId: string, keyId = 'rzp_test_keyA', webhookSecret: string | null = SECRET) {
  await saveRazorpayKeys(tenantId, { keyId, keySecret: 'key_secret_value' }, 'test');
  if (webhookSecret) await testDb.update(razorpayAccounts).set({ webhookSecretEnc: seal(webhookSecret, tenantId) }).where(eq(razorpayAccounts.tenantId, tenantId));
}
const disconnect = (tenantId: string) => testDb.delete(razorpayAccounts).where(eq(razorpayAccounts.tenantId, tenantId));

beforeEach(async () => {
  await resetAndSeed();
  process.env.PAYMENT_KEYS_SECRET = 'unit-test-secret-that-is-at-least-32-chars-long';
  await connect(A.tenant); // tenant A has Razorpay; tenant B does not, unless a test connects it
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PAYMENT_KEYS_SECRET;
});

const getSettings = () => call(settings.GET, 'GET', '/api/settings/payments');
const putSettings = (body: unknown) => call(settings.PUT, 'PUT', '/api/settings/payments', { body });
const pay = (billId: string, body: Record<string, unknown> = {}) => call(billing.PATCH, 'PATCH', '/api/billing', { body: { billId, ...body } });
const bill = async (id: string) => (await q<{ status: string; paid_amount: string }>(`select status, paid_amount from bills where id = '${id}'`))[0];

describe('the settings themselves', () => {
  it('a property that never saved anything gets every manual way, no online links and no deposit', async () => {
    loginAs('ownerA');
    const r = await getSettings();
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ manualMethods: ['cash', 'upi', 'card', 'bank_transfer'], onlinePayments: false, depositPercent: 0, razorpayConfigured: true });
  });

  it('tells the page whether this business has connected Razorpay, and never its secrets', async () => {
    loginAs('ownerA');
    const connected = await getSettings();
    expect(connected.json.razorpayConfigured).toBe(true);
    expect(JSON.stringify(connected.json)).not.toMatch(/key_secret_value|whsec_test_secret|v1\./);
    // front desk learns only yes or no, not which account
    loginAs('frontA');
    const front = await getSettings();
    expect(front.json.razorpayConfigured).toBe(true);
    expect(front.json.razorpay).toBeUndefined();
    // the other business has not connected anything
    loginAs('ownerB');
    expect((await getSettings()).json).toMatchObject({ razorpayConfigured: false, razorpay: { connected: false, keyId: null } });
    // keys without a webhook secret are not enough: a paid link could never mark the bill paid
    await disconnect(A.tenant);
    await connect(A.tenant, 'rzp_test_keyA', null);
    loginAs('ownerA');
    expect((await getSettings()).json).toMatchObject({ razorpayConfigured: false, razorpay: { connected: true, webhookReady: false } });
  });

  it('an owner saves and the choices stick; the other property is untouched', async () => {
    loginAs('ownerA');
    const saved = await putSettings({ manualMethods: ['cash', 'upi'], onlinePayments: true, depositPercent: 30 });
    expect(saved.status).toBe(200);
    expect((await getSettings()).json).toMatchObject({ manualMethods: ['cash', 'upi'], onlinePayments: true, depositPercent: 30 });
    loginAs('ownerB');
    expect((await getSettings()).json).toMatchObject({ manualMethods: ['cash', 'upi', 'card', 'bank_transfer'], onlinePayments: false, depositPercent: 0 });
  });

  it('refuses nonsense and changes nothing', async () => {
    loginAs('ownerA');
    expect((await putSettings({ manualMethods: [], onlinePayments: false, depositPercent: 0 })).status).toBe(400);
    expect((await putSettings({ manualMethods: ['cash'], onlinePayments: false, depositPercent: 150 })).status).toBe(400);
    expect((await putSettings({ manualMethods: ['cash'], onlinePayments: false, depositPercent: -1 })).status).toBe(400);
    expect((await putSettings({ manualMethods: ['bitcoin'], onlinePayments: false, depositPercent: 0 })).status).toBe(400);
    expect((await getSettings()).json).toMatchObject({ depositPercent: 0, manualMethods: ['cash', 'upi', 'card', 'bank_transfer'] });
  });

  it('front desk can read them (they take payments) but only owners and managers can change them', async () => {
    loginAs('frontA');
    expect((await getSettings()).status).toBe(200);
    expect((await putSettings({ manualMethods: ['cash'], onlinePayments: false, depositPercent: 10 })).status).toBe(403);
    loginAs('kitchenA');
    expect((await getSettings()).status).toBe(403);
    loginAs('managerA');
    expect((await putSettings({ manualMethods: ['cash'], onlinePayments: false, depositPercent: 10 })).status).toBe(200);
    loginAs(null);
    expect((await getSettings()).status).toBe(401);
  });

  it('a damaged stored value falls back to the defaults instead of locking staff out', () => {
    expect(parsePaymentSettings({ manualMethods: 'nope', depositPercent: 'x' })).toMatchObject({ manualMethods: ['cash', 'upi', 'card', 'bank_transfer'], depositPercent: 0 });
    expect(parsePaymentSettings(null).onlinePayments).toBe(false);
  });
});

describe('the suggested deposit', () => {
  it('is a whole-rupee share of the total, never more than the total, and 0 when switched off', () => {
    expect(suggestedDeposit(10000, 30)).toBe(3000);
    expect(suggestedDeposit(900, 33)).toBe(297);
    expect(suggestedDeposit(1999, 50)).toBe(1000);
    expect(suggestedDeposit(500, 100)).toBe(500);
    expect(suggestedDeposit(10000, 0)).toBe(0);
    expect(suggestedDeposit(0, 30)).toBe(0);
  });
});

describe('only the allowed ways can record a payment', () => {
  it('a way switched off in Settings is refused, an allowed one still works', async () => {
    loginAs('ownerA');
    await putSettings({ manualMethods: ['cash', 'upi'], onlinePayments: false, depositPercent: 0 });
    loginAs('frontA');
    const refused = await pay(A.bill, { paymentMethod: 'card', amount: 100 });
    expect(refused.status).toBe(409);
    expect(refused.json.error).toMatch(/switched off/i);
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
    expect((await pay(A.bill, { paymentMethod: 'upi', amount: 100 })).status).toBe(200);
    expect(await bill(A.bill)).toMatchObject({ status: 'partial', paid_amount: '100.00' });
  });
});

describe('creating an online payment link', () => {
  const razorpay = (response: { status?: number; body?: unknown } = {}) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response.body ?? { id: 'plink_123', short_url: 'https://rzp.io/i/abc' }), { status: response.status ?? 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const turnOn = async () => { loginAs('ownerA'); await putSettings({ manualMethods: ['cash'], onlinePayments: true, depositPercent: 0 }); loginAs('frontA'); };

  it('asks Razorpay for the exact amount in paise, in INR, with the bill named in the notes, and records nothing yet', async () => {
    const api = razorpay();
    await turnOn();
    const r = await pay(A.bill, { paymentMethod: 'razorpay', amount: 500 });
    expect(r.status).toBe(200);
    expect(r.json.paymentLink).toEqual({ id: 'plink_123', url: 'https://rzp.io/i/abc', amount: 500 });

    const [url, init] = api.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/payment_links');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('rzp_test_keyA:key_secret_value').toString('base64')}`); // this business's own keys
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ amount: 50000, currency: 'INR', accept_partial: false, notes: { billId: A.bill, tenantId: A.tenant } });

    // A link is only a request for money. The bill and its payments are unchanged until the webhook says it was paid.
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
    expect(await q(`select 1 from payments where bill_id = '${A.bill}'`)).toHaveLength(0);
  });

  it('with no amount it asks for everything still owed', async () => {
    const api = razorpay();
    await turnOn();
    expect((await pay(A.bill, { paymentMethod: 'razorpay' })).status).toBe(200);
    expect(JSON.parse(String((api.mock.calls[0] as unknown as [string, RequestInit])[1].body)).amount).toBe(118000);
  });

  it('is refused when online payments are off, when the keys are missing, and for more than is owed', async () => {
    const api = razorpay();
    loginAs('frontA');
    const off = await pay(A.bill, { paymentMethod: 'razorpay', amount: 100 });
    expect(off.status).toBe(409);
    expect(off.json.error).toMatch(/switched off/i);

    await turnOn();
    const tooMuch = await pay(A.bill, { paymentMethod: 'razorpay', amount: 1180.01 });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.json.error).toMatch(/Only ₹1,180 is still owed/);

    await disconnect(A.tenant);
    expect((await pay(A.bill, { paymentMethod: 'razorpay', amount: 100 })).status).toBe(503);
    expect(api).not.toHaveBeenCalled();
  });

  it('says so, and changes nothing, when Razorpay fails or cannot be reached', async () => {
    await turnOn();
    razorpay({ status: 400, body: { error: { description: 'Bad things' } } });
    const refused = await pay(A.bill, { paymentMethod: 'razorpay', amount: 100 });
    expect(refused.status).toBe(502);
    expect(refused.json.error).not.toMatch(/Bad things/); // Razorpay's wording is logged, not shown
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await pay(A.bill, { paymentMethod: 'razorpay', amount: 100 })).status).toBe(502);
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
  });

  it("another property's bill cannot be linked", async () => {
    razorpay();
    await turnOn();
    expect((await pay(B.bill, { paymentMethod: 'razorpay', amount: 100 })).status).toBe(404);
  });
});

describe('creating an online payment QR', () => {
  const QR_BODY = { id: 'qr_abc123', image_url: 'https://rzp.io/qr/abc123.png', status: 'active' };
  const razorpay = (response: { status?: number; body?: unknown } = {}) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response.body ?? QR_BODY), { status: response.status ?? 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const turnOn = async () => { loginAs('ownerA'); await putSettings({ manualMethods: ['cash'], onlinePayments: true, depositPercent: 0 }); loginAs('frontA'); };

  it('asks Razorpay for a one-time, fixed-amount UPI QR for the exact paise, and records nothing yet', async () => {
    const api = razorpay();
    await turnOn();
    const r = await pay(A.bill, { paymentMethod: 'razorpay_qr', amount: 500 });
    expect(r.status).toBe(200);
    expect(r.json.paymentQr).toMatchObject({ id: 'qr_abc123', imageUrl: 'https://rzp.io/qr/abc123.png', amount: 500 });
    expect(new Date(r.json.paymentQr.expiresAt).getTime()).toBeGreaterThan(Date.now() + 10 * 60 * 1000);

    const [url, init] = api.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/payments/qr_codes');
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ type: 'upi_qr', usage: 'single_use', fixed_amount: true, payment_amount: 50000, notes: { billId: A.bill, tenantId: A.tenant } });
    expect(sent.close_by).toBeGreaterThan(Math.floor(Date.now() / 1000) + 600);

    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
    expect(await q(`select 1 from payments where bill_id = '${A.bill}'`)).toHaveLength(0);
  });

  it('follows the same rules as a link: off in Settings, no keys, too much, or Razorpay failing', async () => {
    const api = razorpay();
    loginAs('frontA');
    expect((await pay(A.bill, { paymentMethod: 'razorpay_qr', amount: 100 })).status).toBe(409);
    await turnOn();
    expect((await pay(A.bill, { paymentMethod: 'razorpay_qr', amount: 1180.01 })).status).toBe(409);
    expect(api).not.toHaveBeenCalled();
    razorpay({ status: 400, body: { error: { description: 'Bad things' } } });
    const refused = await pay(A.bill, { paymentMethod: 'razorpay_qr', amount: 100 });
    expect(refused.status).toBe(502);
    expect(refused.json.error).not.toMatch(/Bad things/);
    await disconnect(A.tenant);
    expect((await pay(A.bill, { paymentMethod: 'razorpay_qr', amount: 100 })).status).toBe(503);
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
  });

  it('says plainly when the Razorpay account has no UPI (as in test mode), and records nothing', async () => {
    loginAs('frontA');
    await turnOn();
    razorpay({ status: 400, body: { error: { description: 'UPI transactions are not enabled for the merchant' } } });
    const r = await pay(A.bill, { paymentMethod: 'razorpay_qr', amount: 100 });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/^UPI QR codes are not available/);
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
  });

  it("another property's bill cannot get a QR", async () => {
    razorpay();
    await turnOn();
    expect((await pay(B.bill, { paymentMethod: 'razorpay_qr', amount: 100 })).status).toBe(404);
  });

  it('closing a QR only works for a QR made for this property', async () => {
    const closeQr = (qr: string) => call(billing.DELETE, 'DELETE', `/api/billing?qr=${qr}`);
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(String(url).endsWith('/close') ? {} : { id: 'qr_abc123', notes: { tenantId: A.tenant } })));
    vi.stubGlobal('fetch', fetchMock);

    loginAs('frontA');
    expect((await closeQr('qr_abc123')).json).toMatchObject({ closed: true });
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([
      'https://api.razorpay.com/v1/payments/qr_codes/qr_abc123',
      'https://api.razorpay.com/v1/payments/qr_codes/qr_abc123/close',
    ]);

    fetchMock.mockClear();
    loginAs('ownerB');
    expect((await closeQr('qr_abc123')).json).toMatchObject({ closed: false }); // B has no Razorpay account at all
    expect(fetchMock).not.toHaveBeenCalled();
    await connect(B.tenant, 'rzp_test_keyB');
    expect((await closeQr('qr_abc123')).json).toMatchObject({ closed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1); // looked it up, saw it was not theirs, never closed it
    expect((await closeQr('../../evil')).json).toMatchObject({ closed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the Razorpay webhook', () => {
  const event = (billId: string, tenantId: string, paymentId = 'pay_1', amountPaise = 50000, name = 'payment_link.paid') => ({
    event: name,
    payload: {
      payment_link: { entity: { id: 'plink_123', notes: { billId, tenantId } } },
      payment: { entity: { id: paymentId, amount: amountPaise, status: 'captured' } },
    },
  });
  const deliver = (body: unknown, opts: { signature?: string | null; secret?: string; to?: string } = {}) => {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const signature = opts.signature === undefined ? createHmac('sha256', opts.secret ?? SECRET).update(raw).digest('hex') : opts.signature;
    const tenantId = opts.to ?? A.tenant; // each business has its own webhook address
    return webhook.POST(new NextRequest(`http://localhost/api/webhooks/razorpay/${tenantId}`, {
      method: 'POST', body: raw, headers: signature ? { 'x-razorpay-signature': signature } : {},
    }), { params: { tenantId } });
  };
  const paymentsOf = (billId: string) => q<{ amount: string; method: string; reference: string; razorpay_payment_id: string }>(`select * from payments where bill_id = '${billId}'`);

  it('a signed "paid" event adds the payment to the bill and moves it to part paid', async () => {
    const res = await deliver(event(A.bill, A.tenant));
    expect(res.status).toBe(200);
    expect(await bill(A.bill)).toMatchObject({ status: 'partial', paid_amount: '500.00' });
    const [p, ...rest] = await paymentsOf(A.bill);
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ amount: '500.00', method: 'razorpay', reference: 'pay_1', razorpay_payment_id: 'pay_1' });
  });

  it('paying the last of it closes the bill', async () => {
    await deliver(event(A.bill, A.tenant, 'pay_1', 50000));
    await deliver(event(A.bill, A.tenant, 'pay_2', 68000));
    expect(await bill(A.bill)).toMatchObject({ status: 'paid', paid_amount: '1180.00' });
    expect(await q(`select settled_at from bills where id = '${A.bill}' and settled_at is not null`)).toHaveLength(1);
  });

  it('the same payment delivered again (Razorpay retries) is counted once', async () => {
    await deliver(event(A.bill, A.tenant));
    const again = await deliver(event(A.bill, A.tenant));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true });
    expect(await bill(A.bill)).toMatchObject({ paid_amount: '500.00' });
    expect(await paymentsOf(A.bill)).toHaveLength(1);
  });

  it('two deliveries at the same instant still count once', async () => {
    const results = await Promise.all([deliver(event(A.bill, A.tenant)), deliver(event(A.bill, A.tenant))]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await bill(A.bill)).toMatchObject({ paid_amount: '500.00' });
    expect(await paymentsOf(A.bill)).toHaveLength(1);
  });

  it('a delivery that loses the race on the unique payment id is answered 200 duplicate, not 500', async () => {
    // On Neon two real connections can both pass the "not seen yet" check; the loser hits the unique index.
    // Drizzle wraps that error: the constraint name is only on `cause` (this returned 500 until 2026-11-11).
    const lostRace = Object.assign(new Error('Failed query: with moved as ...'), {
      cause: new Error('duplicate key value violates unique constraint "payments_razorpay_payment_uq"'),
    });
    const spy = vi.spyOn(testDb, 'execute').mockRejectedValueOnce(lostRace);
    const res = await deliver(event(A.bill, A.tenant));
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
  });

  it('any other database failure is a 500, so Razorpay retries later', async () => {
    const spy = vi.spyOn(testDb, 'execute').mockRejectedValueOnce(Object.assign(new Error('Failed query'), { cause: new Error('connection terminated') }));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await deliver(event(A.bill, A.tenant));
    spy.mockRestore(); quiet.mockRestore();
    expect(res.status).toBe(500);
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
  });

  it('refuses an unsigned, wrongly signed or tampered request and changes nothing', async () => {
    const body = event(A.bill, A.tenant);
    expect((await deliver(body, { signature: null })).status).toBe(400);
    expect((await deliver(body, { signature: 'deadbeef' })).status).toBe(400);
    expect((await deliver(body, { secret: 'someone else' })).status).toBe(400);
    const raw = JSON.stringify(body);
    const goodSignature = createHmac('sha256', SECRET).update(raw).digest('hex');
    expect((await deliver(raw.replace('50000', '99999'), { signature: goodSignature })).status).toBe(400);
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
  });

  it('refuses everything for a business with no webhook secret, no account, or an address that is not a business', async () => {
    await disconnect(A.tenant);
    await connect(A.tenant, 'rzp_test_keyA', null);
    expect((await deliver(event(A.bill, A.tenant), { secret: '' })).status).toBe(400);
    expect((await deliver(event(A.bill, A.tenant))).status).toBe(400);
    await disconnect(A.tenant);
    expect((await deliver(event(A.bill, A.tenant))).status).toBe(400);
    expect((await deliver(event(A.bill, A.tenant), { to: 'not-a-tenant' })).status).toBe(400);
    expect(verifyWebhookSignature('x', 'y', undefined)).toBe(false);
    expect(verifyWebhookSignature('x', 'y', null)).toBe(false);
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
  });

  it('each business has its own secret: one business cannot sign for another', async () => {
    await connect(B.tenant, 'rzp_test_keyB', 'whsec_business_b');
    // A's secret at B's address is refused, even for B's own bill
    expect((await deliver(event(B.bill, B.tenant, 'pay_b1', 10000), { to: B.tenant })).status).toBe(400);
    // B's secret at A's address is refused
    expect((await deliver(event(A.bill, A.tenant), { secret: 'whsec_business_b' })).status).toBe(400);
    // B, signing correctly at its own address, cannot pay A's bill: the business is the address, not the notes
    const cross = await deliver(event(A.bill, A.tenant, 'pay_b2'), { to: B.tenant, secret: 'whsec_business_b' });
    expect(cross.status).toBe(200);
    expect(await cross.json()).toMatchObject({ ignored: 'no bill reference' });
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
    // and B's own payment at B's own address works
    const own = await deliver(event(B.bill, B.tenant, 'pay_b3', 10000), { to: B.tenant, secret: 'whsec_business_b' });
    expect(own.status).toBe(200);
    expect(await bill(B.bill)).toMatchObject({ status: 'partial', paid_amount: '100.00' });
  });

  it('a signed "QR credited" event pays the bill the same way, once, and says it was a QR', async () => {
    const qrEvent = (paymentId: string, amountPaise: number) => ({
      event: 'qr_code.credited',
      payload: {
        qr_code: { entity: { id: 'qr_abc123', notes: { billId: A.bill, tenantId: A.tenant } } },
        payment: { entity: { id: paymentId, amount: amountPaise, status: 'captured' } },
      },
    });
    expect((await deliver(qrEvent('pay_qr1', 50000))).status).toBe(200);
    expect((await deliver(qrEvent('pay_qr1', 50000))).status).toBe(200); // retry
    expect(await bill(A.bill)).toMatchObject({ status: 'partial', paid_amount: '500.00' });
    const rows = await q<{ method: string; note: string }>(`select method, note from payments where bill_id = '${A.bill}'`);
    expect(rows).toEqual([{ method: 'razorpay', note: 'Paid by scanning the QR code' }]);
  });

  it('a QR event with no usable bill reference changes nothing', async () => {
    const res = await deliver({ event: 'qr_code.credited', payload: { qr_code: { entity: { id: 'qr_x', notes: {} } }, payment: { entity: { id: 'pay_z', amount: 50000 } } } });
    expect(res.status).toBe(200);
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
  });

  it('ignores events that are not a paid link, without error', async () => {
    const res = await deliver(event(A.bill, A.tenant, 'pay_9', 50000, 'payment_link.expired'));
    expect(res.status).toBe(200);
    expect(await bill(A.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
  });

  it("cannot pay another property's bill: the business the webhook belongs to has to own the bill", async () => {
    const res = await deliver(event(B.bill, A.tenant, 'pay_x'));
    expect(res.status).toBe(200);
    expect(await bill(B.bill)).toMatchObject({ status: 'open', paid_amount: '0.00' });
    expect(await paymentsOf(B.bill)).toHaveLength(0);
  });

  it('money that cannot be applied (the bill was already paid in cash) is saved for review, not lost and not double counted', async () => {
    loginAs('frontA');
    expect((await pay(A.bill, { paymentMethod: 'cash' })).status).toBe(200); // settles the whole bill
    const res = await deliver(event(A.bill, A.tenant, 'pay_late', 50000));
    expect(await res.json()).toMatchObject({ needsReview: true });
    expect(await bill(A.bill)).toMatchObject({ status: 'paid', paid_amount: '1180.00' });
    expect(await paymentsOf(A.bill)).toHaveLength(1); // only the cash payment
    const saved = await q<{ parsed_amount: string; parsed_reference: string; match_confidence: string; matched_bill_id: string }>(`select * from payment_events where tenant_id = '${A.tenant}'`);
    expect(saved).toEqual([expect.objectContaining({ parsed_amount: '500.00', parsed_reference: 'pay_late', match_confidence: 'unmatched', matched_bill_id: A.bill })]);
  });

  it('an unreadable but signed body is acknowledged so Razorpay stops retrying it', async () => {
    const res = await deliver('{"event": 12');
    expect(res.status).toBe(200);
  });
});
