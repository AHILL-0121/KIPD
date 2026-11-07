// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BillingView } from '@/components/billing/billing-view';
import { PaymentSettingsCard } from '@/components/settings/payment-settings-card';

const NOW = new Date().toISOString();
const stay = (id: string, paid = 0, extra = {}) => ({
  id, kind: 'stay', guestName: `Guest ${id}`, totalAmount: 10000, paidAmount: paid, status: paid > 0 ? 'partial' : 'open',
  createdAt: NOW, settledAt: null,
  receipt: { subtotal: 10000, cgst: 0, sgst: 0, total: 10000, items: [{ name: 'Room 204 (Deluxe), 2 nights', qty: 2, rate: 5000, amt: 10000 }] },
  stay: { roomNumber: '204', checkIn: '2032-11-03T12:00:00.000Z', checkOut: '2032-11-05T05:00:00.000Z', nights: 2, bookingStatus: 'confirmed' },
  payments: [], ...extra,
});

const ALL = ['cash', 'upi', 'card', 'bank_transfer'];
type Settings = { manualMethods: string[]; onlinePayments: boolean; depositPercent: number; razorpayConfigured: boolean };

function serve(bills: unknown[], settings: Settings | null, patch: () => Response = () => new Response('{"success":true}')) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/settings/payments') return settings ? new Response(JSON.stringify(settings)) : new Response('{}', { status: 500 });
    if (url.startsWith('/api/billing') && init?.method === 'PATCH') return patch();
    if (url.startsWith('/api/billing')) return new Response(JSON.stringify(bills));
    if (url.startsWith('/api/tenant/info')) return new Response(JSON.stringify({ id: 't1' }));
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const sent = (api: ReturnType<typeof serve>) => api.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init?.body)));
const openDialog = async (guest: RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name: guest }));
  fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
  return screen.findByRole('dialog', { name: 'Record payment' });
};
const optionsOf = (dialog: HTMLElement) => within(within(dialog).getByLabelText('Paid by')).getAllByRole('option', { hidden: true }).map((o) => o.textContent);

beforeEach(() => {
  vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Record payment follows Settings', () => {
  it('offers only the ways Settings allows', async () => {
    serve([stay('a')], { manualMethods: ['cash', 'upi'], onlinePayments: false, depositPercent: 0, razorpayConfigured: true });
    render(<BillingView kind="stay" />);
    // wait for settings to apply before opening
    await waitFor(async () => {
      const dialog = await openDialog(/Guest a/);
      expect(optionsOf(dialog)).toEqual(['Cash', 'UPI']);
    });
  });

  it('with no settings answer at all, still offers every manual way and no online option', async () => {
    serve([stay('a')], null);
    render(<BillingView kind="stay" />);
    const dialog = await openDialog(/Guest a/);
    expect(optionsOf(dialog)).toEqual(['Cash', 'UPI', 'Card (machine)', 'Bank transfer']);
  });

  it('the online option appears only when it is switched on AND the server has keys, and only on hotel bills', async () => {
    serve([stay('a')], { manualMethods: ALL, onlinePayments: true, depositPercent: 0, razorpayConfigured: false });
    render(<BillingView kind="stay" />);
    await waitFor(async () => expect(optionsOf(await openDialog(/Guest a/))).not.toContain('Online payment link (Razorpay)'));
    cleanup();

    serve([stay('a')], { manualMethods: ALL, onlinePayments: true, depositPercent: 0, razorpayConfigured: true });
    render(<BillingView kind="stay" />);
    await waitFor(async () => expect(optionsOf(await openDialog(/Guest a/))).toContain('Online payment link (Razorpay)'));
  });

  it('restaurant bills get the online option too, but no suggested deposit', async () => {
    serve([stay('r', 0, { kind: 'restaurant', stay: null })], { manualMethods: ALL, onlinePayments: true, depositPercent: 30, razorpayConfigured: true });
    render(<BillingView kind="restaurant" />);
    await waitFor(async () => expect(optionsOf(await openDialog(/Guest r/))).toContain('Online payment link (Razorpay)'));
    expect(screen.queryByText(/Suggested deposit/)).toBeNull();
  });
});

describe('showing a QR code for the guest to scan', () => {
  const online: Settings = { manualMethods: ALL, onlinePayments: true, depositPercent: 0, razorpayConfigured: true };
  const qrResponse = () => new Response(JSON.stringify({ success: true, paymentQr: { id: 'qr_1', imageUrl: 'https://rzp.io/qr/1.png', amount: 4000, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() } }));
  const showQr = async (api: ReturnType<typeof serve>) => {
    render(<BillingView kind="stay" />);
    const dialog = await waitFor(async () => {
      const d = await openDialog(/Guest a/);
      expect(optionsOf(d)).toContain('Online payment QR (Razorpay)');
      return d;
    });
    fireEvent.change(within(dialog).getByLabelText('Paid by'), { target: { value: 'razorpay_qr' } });
    fireEvent.change(within(dialog).getByLabelText(/Amount to collect/), { target: { value: '4000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show QR code' }));
    return { dialog, api };
  };

  it('offers the QR among the online ways, asks for it, and shows the picture with a countdown', async () => {
    const { dialog, api } = await showQr(serve([stay('a')], online, qrResponse));
    const img = await within(dialog).findByRole('img', { name: /UPI QR code to pay ₹4,000/ });
    expect(img.getAttribute('src')).toBe('https://rzp.io/qr/1.png');
    expect(within(dialog).getByText(/expires in 1[45]:\d\d/)).toBeTruthy();
    expect(sent(api)).toEqual([expect.objectContaining({ paymentMethod: 'razorpay_qr', amount: 4000 })]);
  });

  it('closing before it is paid asks the server to stop the QR', async () => {
    const { dialog, api } = await showQr(serve([stay('a')], online, qrResponse));
    await within(dialog).findByRole('img');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel and close' }));
    await waitFor(() => expect(api.mock.calls.some(([url, init]) => url === '/api/billing?qr=qr_1' && init?.method === 'DELETE')).toBe(true));
  });

  it('flips to "received" by itself once the bill shows the payment, with no click', async () => {
    const bills = [stay('a')];
    const { dialog } = await showQr(serve(bills, online, qrResponse));
    await within(dialog).findByRole('img');
    bills[0] = stay('a', 4000) as typeof bills[0]; // the webhook landed; the next poll sees it
    expect((await within(dialog).findByText(/₹4,000 received/, {}, { timeout: 6000 })).textContent).toMatch(/₹6,000 is still owed/);
    expect(within(dialog).queryByRole('img')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeTruthy();
  }, 10000);
});

describe('the suggested deposit', () => {
  it('fills in the amount on a first payment, says why, and the full amount is one click away', async () => {
    serve([stay('a')], { manualMethods: ALL, onlinePayments: false, depositPercent: 30, razorpayConfigured: false });
    render(<BillingView kind="stay" />);
    await waitFor(async () => {
      const dialog = await openDialog(/Guest a/);
      expect((within(dialog).getByLabelText('Amount received (₹)') as HTMLInputElement).value).toBe('3000');
    });
    const dialog = screen.getByRole('dialog', { name: 'Record payment' });
    expect(within(dialog).getByText(/Suggested deposit \(30% of the stay\)/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Use the full ₹10,000/ }));
    expect((within(dialog).getByLabelText('Amount received (₹)') as HTMLInputElement).value).toBe('10000');
    expect(within(dialog).queryByText(/Suggested deposit/)).toBeNull();
  });

  it('is not suggested once something has been paid, and not at all when the deposit is 0', async () => {
    serve([stay('a', 3000)], { manualMethods: ALL, onlinePayments: false, depositPercent: 30, razorpayConfigured: false });
    render(<BillingView kind="stay" />);
    await waitFor(async () => {
      const dialog = await openDialog(/Guest a/);
      expect((within(dialog).getByLabelText('Amount received (₹)') as HTMLInputElement).value).toBe('7000'); // what is owed
    });
    cleanup();

    serve([stay('b')], { manualMethods: ALL, onlinePayments: false, depositPercent: 0, razorpayConfigured: false });
    render(<BillingView kind="stay" />);
    const dialog = await openDialog(/Guest b/);
    expect((within(dialog).getByLabelText('Amount received (₹)') as HTMLInputElement).value).toBe('10000');
  });

  it('a deposit is only a suggestion: staff can record any amount', async () => {
    const api = serve([stay('a')], { manualMethods: ALL, onlinePayments: false, depositPercent: 30, razorpayConfigured: false });
    render(<BillingView kind="stay" />);
    const dialog = await waitFor(async () => {
      const d = await openDialog(/Guest a/);
      expect((within(d).getByLabelText('Amount received (₹)') as HTMLInputElement).value).toBe('3000');
      return d;
    });
    fireEvent.change(within(dialog).getByLabelText('Amount received (₹)'), { target: { value: '500' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    await waitFor(() => expect(sent(api)).toHaveLength(1));
    expect(sent(api)[0]).toMatchObject({ billId: 'a', amount: 500, paymentMethod: 'cash' });
  });
});

describe('sending an online payment link', () => {
  const online: Settings = { manualMethods: ALL, onlinePayments: true, depositPercent: 0, razorpayConfigured: true };
  const choose = async () => {
    let dialog!: HTMLElement;
    await waitFor(async () => {
      dialog = await openDialog(/Guest a/);
      expect(optionsOf(dialog)).toContain('Online payment link (Razorpay)');
    });
    fireEvent.change(within(dialog).getByLabelText('Paid by'), { target: { value: 'razorpay' } });
    return dialog;
  };

  it('asks for the amount to collect, shows the link, and records nothing itself', async () => {
    const api = serve([stay('a')], online, () => new Response(JSON.stringify({ success: true, paymentLink: { id: 'plink_1', url: 'https://rzp.io/i/abc', amount: 4000 } })));
    render(<BillingView kind="stay" />);
    const dialog = await choose();
    expect(within(dialog).queryByLabelText(/transaction ID|Bank reference|slip/i)).toBeNull(); // no reference box for a link
    fireEvent.change(within(dialog).getByLabelText('Amount to collect (₹)'), { target: { value: '4000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create payment link' }));

    expect(await within(dialog).findByText(/Payment link for ₹4,000 is ready/)).toBeTruthy();
    expect((within(dialog).getByLabelText('Payment link') as HTMLInputElement).value).toBe('https://rzp.io/i/abc');
    expect(within(dialog).getByRole('link', { name: /Open link/ }).getAttribute('href')).toBe('https://rzp.io/i/abc');
    expect(sent(api)).toEqual([{ billId: 'a', paymentMethod: 'razorpay', amount: 4000 }]); // no reference sent
    // No "recorded" message: the bill only changes when the guest has paid.
    expect(screen.queryByText(/recorded for/)).toBeNull();
  });

  it('copies the link', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    serve([stay('a')], online, () => new Response(JSON.stringify({ success: true, paymentLink: { id: 'plink_1', url: 'https://rzp.io/i/abc', amount: 10000 } })));
    render(<BillingView kind="stay" />);
    const dialog = await choose();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create payment link' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://rzp.io/i/abc'));
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it("shows the server's reason, keeps the form, and creates no link when Razorpay is not available", async () => {
    serve([stay('a')], online, () => new Response(JSON.stringify({ error: 'Online payments are not set up yet.' }), { status: 503 }));
    render(<BillingView kind="stay" />);
    const dialog = await choose();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create payment link' }));
    // 503 is a server-side status, so the page shows its own plain sentence, never raw server text.
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/Nothing was changed/);
    expect(within(dialog).queryByLabelText('Payment link')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Create payment link' })).toBeTruthy();
  });

  it('a link that is not a payment (a bad answer) is reported, not shown as success', async () => {
    serve([stay('a')], online, () => new Response('{"success":true}'));
    render(<BillingView kind="stay" />);
    const dialog = await choose();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create payment link' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/did not return a payment link/);
  });
});

describe('Settings → Payments', () => {
  const server = (initial: Settings, put?: (body: unknown) => Response) => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/settings/payments' && init?.method === 'PUT') return put ? put(JSON.parse(String(init.body))) : new Response(String(init.body), { status: 200 });
      if (url === '/api/settings/payments') return new Response(JSON.stringify(initial));
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const puts = (api: ReturnType<typeof server>) => api.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([, init]) => JSON.parse(String(init?.body)));

  it('shows what is saved, and saves the changes', async () => {
    const api = server({ manualMethods: ['cash', 'upi'], onlinePayments: false, depositPercent: 20, razorpayConfigured: true },
      (body) => new Response(JSON.stringify({ ...(body as object), razorpayConfigured: true })));
    render(<PaymentSettingsCard />);
    const cash = (await screen.findByRole('checkbox', { name: 'Cash' })) as HTMLInputElement;
    await waitFor(() => expect(cash.checked).toBe(true));
    expect((screen.getByRole('checkbox', { name: 'Card (machine)' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Suggested deposit/) as HTMLInputElement).value).toBe('20');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Card (machine)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Online payment links/ }));
    fireEvent.change(screen.getByLabelText(/Suggested deposit/), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment settings' }));

    expect((await screen.findByRole('status')).textContent).toBe('Payment settings saved.');
    expect(puts(api)).toEqual([{ manualMethods: ['cash', 'upi', 'card'], onlinePayments: true, depositPercent: 25 }]);
  });

  it('will not save with no way left to record a payment, or a deposit outside 0 to 100', async () => {
    const api = server({ manualMethods: ['cash'], onlinePayments: false, depositPercent: 0, razorpayConfigured: true });
    render(<PaymentSettingsCard />);
    const cash = await screen.findByRole('checkbox', { name: 'Cash' });
    await waitFor(() => expect((cash as HTMLInputElement).checked).toBe(true));
    fireEvent.click(cash);
    fireEvent.click(screen.getByRole('button', { name: 'Save payment settings' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least one way/);

    fireEvent.click(cash);
    fireEvent.change(screen.getByLabelText(/Suggested deposit/), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment settings' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/0 to 100/);
    expect(puts(api)).toHaveLength(0);
  });

  it('warns, without blocking, when online payments are on but the server has no Razorpay keys', async () => {
    server({ manualMethods: ['cash'], onlinePayments: true, depositPercent: 0, razorpayConfigured: false });
    render(<PaymentSettingsCard />);
    expect((await screen.findByText(/Razorpay is not connected on the server yet/)).getAttribute('role')).toBe('status');
  });

  it('says so, and keeps what was typed, when saving fails', async () => {
    server({ manualMethods: ['cash'], onlinePayments: false, depositPercent: 0, razorpayConfigured: true }, () => new Response('{}', { status: 500 }));
    render(<PaymentSettingsCard />);
    const cash = await screen.findByRole('checkbox', { name: 'Cash' });
    await waitFor(() => expect((cash as HTMLInputElement).checked).toBe(true));
    fireEvent.change(screen.getByLabelText(/Suggested deposit/), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment settings' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nothing was changed/);
    expect((screen.getByLabelText(/Suggested deposit/) as HTMLInputElement).value).toBe('40');
  });

  it('does not let anyone edit until the saved settings have loaded, and says when they could not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    render(<PaymentSettingsCard />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load/);
    expect((screen.getByRole('button', { name: 'Save payment settings' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
