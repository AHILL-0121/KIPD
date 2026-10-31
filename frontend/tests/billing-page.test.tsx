// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BillingView } from '@/components/billing/billing-view';
import { billStatus } from '@/lib/bill-status';

const NOW = new Date().toISOString();
const bill = (id: string, status: string, extra = {}) => ({
  id, kind: 'restaurant', guestName: `Guest ${id}`, totalAmount: 500, paidAmount: status === 'paid' ? 500 : 0, status,
  createdAt: NOW, settledAt: status === 'paid' ? NOW : null, receipt: null, stay: null, payments: [], ...extra,
});
const stayReceipt = { subtotal: 10000, cgst: 0, sgst: 0, total: 10000, items: [{ name: 'Room 204 (Deluxe), 2 nights', qty: 2, rate: 5000, amt: 10000 }] };
const stay = (id: string, status: string, paid = 0, extra = {}) => bill(id, status, {
  kind: 'stay', totalAmount: 10000, paidAmount: paid, receipt: stayReceipt,
  stay: { roomNumber: '204', checkIn: '2032-11-03T12:00:00.000Z', checkOut: '2032-11-05T05:00:00.000Z', nights: 2, bookingStatus: 'confirmed' }, ...extra,
});
const payment = (amount: number, extra = {}) => ({ id: `p${amount}`, amount, method: 'upi', reference: 'UTR123', receivedBy: 'Front A', note: null, createdAt: NOW, ...extra });

function serve(bills: unknown[], opts: { billsOk?: boolean; payStatus?: number; payError?: string } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/billing') && init?.method === 'PATCH') {
      return (opts.payStatus ?? 200) < 400 ? new Response('{"success":true}') : new Response(JSON.stringify({ error: opts.payError }), { status: opts.payStatus });
    }
    if (url.startsWith('/api/billing')) return opts.billsOk === false ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(bills));
    if (url.startsWith('/api/tenant/info')) return new Response(JSON.stringify({ id: 't1' }));
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const sent = (api: ReturnType<typeof serve>) => api.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init?.body)));
const openBill = async (name: RegExp) => { fireEvent.click(await screen.findByRole('button', { name })); };

beforeEach(() => {
  vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('bill status wording', () => {
  it('uses plain words and never red', () => {
    expect(billStatus('open').label).toBe('Unpaid');
    expect(billStatus('partial').label).toBe('Part paid');
    expect(billStatus('paid').tone).toBe('sage');
    expect(billStatus('void').label).toBe('Cancelled');
    for (const s of ['open', 'partial', 'paid', 'void']) expect(billStatus(s).tone).not.toBe('terra');
  });
});

describe('two billing pages, one component', () => {
  it('Hotel billing asks for stay bills only and shows the stay on each bill', async () => {
    const api = serve([stay('a', 'partial', 3000, { payments: [payment(3000)] })]);
    render(<BillingView kind="stay" />);
    expect(await screen.findByRole('heading', { name: 'Hotel billing' })).toBeTruthy();
    expect(api.mock.calls[0][0]).toBe('/api/billing?kind=stay');
    expect(await screen.findByText(/Room 204 · .* · 2 nights/)).toBeTruthy();
    expect(screen.getByText('₹3,000 paid, ₹7,000 owed')).toBeTruthy();
    expect(screen.getByText('Part paid')).toBeTruthy();
  });

  it('Restaurant billing asks for restaurant bills only', async () => {
    const api = serve([bill('t', 'open')]);
    render(<BillingView kind="restaurant" />);
    expect(await screen.findByRole('heading', { name: 'Restaurant billing' })).toBeTruthy();
    expect(api.mock.calls[0][0]).toBe('/api/billing?kind=restaurant');
    expect(await screen.findByText('Guest t')).toBeTruthy();
  });
});

describe('the figures', () => {
  it('still to collect is what is owed on unpaid and part-paid bills; collected today counts every payment made today', async () => {
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    serve([
      stay('a', 'partial', 3000, { payments: [payment(2000), payment(1000, { id: 'p2' })] }),
      stay('b', 'open'),
      stay('c', 'paid', 10000, { payments: [payment(6000, { id: 'p3' }), payment(4000, { id: 'p4', createdAt: yesterday })] }),
    ]);
    render(<BillingView kind="stay" />);
    await screen.findByText('Guest a');
    expect(screen.getByText('Still to collect').previousSibling?.textContent).toBe('₹17,000'); // 7,000 + 10,000
    expect(screen.getByText('Unpaid bills', { selector: 'div' }).previousSibling?.textContent).toBe('2');
    expect(screen.getByText('Collected today').previousSibling?.textContent).toBe('₹9,000'); // 2,000 + 1,000 + 6,000, not yesterday's 4,000
  });
});

describe('the bill and its payments', () => {
  it('lists each payment with how it was paid, its reference, and who took it; a stay receipt shows no tax lines', async () => {
    serve([stay('a', 'partial', 3000, { payments: [payment(3000, { note: 'Advance' })] })]);
    render(<BillingView kind="stay" />);
    await openBill(/Guest a/);
    const list = within(screen.getByText('Payments').parentElement!);
    expect(list.getByText('UPI · UTR123')).toBeTruthy();
    expect(list.getByText(/received by Front A · Advance/)).toBeTruthy();
    expect(screen.getByText('Still owed').nextSibling?.textContent).toBe('₹7,000');
    expect(screen.queryByText(/SGST/)).toBeNull();
    expect(screen.getByText(/STAY · ROOM 204/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'KIPD HOTEL' })).toBeTruthy(); // the receipt heading says hotel, not restaurant
  });

  it('a restaurant receipt still shows its GST lines', async () => {
    serve([bill('t', 'open', { receipt: { subtotal: 200, cgst: 5, sgst: 5, total: 210, items: [{ name: 'Chilli Chicken', qty: 2, rate: 100, amt: 200 }] } })]);
    render(<BillingView kind="restaurant" />);
    await openBill(/Guest t/);
    expect(screen.getByText('SGST (2.5%):')).toBeTruthy();
  });
});

describe('recording a payment', () => {
  it('opens a labelled dialog with the full amount owed filled in, and records a part payment with its details', async () => {
    const api = serve([stay('a', 'open')]);
    render(<BillingView kind="stay" />);
    await openBill(/Guest a/);
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' });
    expect((within(dialog).getByLabelText('Amount received (₹)') as HTMLInputElement).value).toBe('10000');
    expect(sent(api)).toEqual([]); // nothing is recorded until it is saved

    fireEvent.change(within(dialog).getByLabelText('Amount received (₹)'), { target: { value: '3000' } });
    fireEvent.change(within(dialog).getByLabelText('Paid by'), { target: { value: 'upi' } });
    fireEvent.change(within(dialog).getByLabelText('UPI transaction ID (optional)'), { target: { value: 'UTR777' } });
    fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Deposit' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save payment' }));

    await waitFor(() => expect(sent(api)).toEqual([{ billId: 'a', paymentMethod: 'upi', amount: 3000, reference: 'UTR777', note: 'Deposit' }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await screen.findByText('₹3,000 recorded for Guest a. ₹7,000 is still owed.'))).toBeTruthy();
  });

  it('cash needs no reference, and paying the full balance says the bill is paid in full', async () => {
    const api = serve([bill('t', 'open')]);
    render(<BillingView kind="restaurant" />);
    await openBill(/Guest t/);
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' });
    expect(within(dialog).queryByLabelText(/transaction ID|bank reference|slip number/i)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    await waitFor(() => expect(sent(api)).toEqual([{ billId: 't', paymentMethod: 'cash', amount: 500 }]));
    expect(await screen.findByText("Guest t's bill is paid in full.")).toBeTruthy();
  });

  it('refuses an amount above what is owed, or nothing at all, before sending anything', async () => {
    const api = serve([stay('a', 'partial', 4000)]);
    render(<BillingView kind="stay" />);
    await openBill(/Guest a/);
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' });
    fireEvent.change(within(dialog).getByLabelText('Amount received (₹)'), { target: { value: '6000.50' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Only ₹6,000 is still owed on this bill.');
    fireEvent.change(within(dialog).getByLabelText('Amount received (₹)'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Enter the amount received.');
    expect(sent(api)).toEqual([]);
  });

  it("shows the server's reason inside the dialog instead of an alert, and keeps it open", async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    serve([stay('a', 'open')], { payStatus: 409, payError: 'This bill is already paid' });
    render(<BillingView kind="stay" />);
    await openBill(/Guest a/);
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record payment' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('This bill is already paid');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('a paid bill offers no payment button', async () => {
    serve([stay('a', 'paid', 10000)]);
    render(<BillingView kind="stay" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Paid invoices' }));
    await openBill(/Guest a/);
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
    expect(screen.getByRole('button', { name: /Print bill/ })).toBeTruthy();
  });
});

describe('when something is wrong', () => {
  it('says so when the bills cannot be loaded', async () => {
    serve([], { billsOk: false });
    render(<BillingView kind="stay" />);
    expect((await screen.findByRole('status')).textContent).toMatch(/couldn.t refresh/i);
  });
});
