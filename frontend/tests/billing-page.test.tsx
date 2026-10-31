// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BillingPage from '@/app/dashboard/billing/page';
import { billStatus } from '@/lib/bill-status';

const bill = (id: string, status: string, extra = {}) => ({
  id, guestName: `Guest ${id}`, totalAmount: 500, paidAmount: status === 'paid' ? 500 : 0, status,
  createdAt: new Date().toISOString(), settledAt: status === 'paid' ? new Date().toISOString() : null, items: [], receipt: null, ...extra,
});

function serve(bills: unknown[], opts: { billsOk?: boolean; payOk?: boolean } = {}) {
  const state = { billsOk: opts.billsOk ?? true, payOk: opts.payOk ?? true };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/billing' && init?.method === 'PATCH') return state.payOk ? new Response('{"success":true}') : new Response('{}', { status: 500 });
    if (url === '/api/billing') return state.billsOk ? new Response(JSON.stringify(bills)) : new Response('{}', { status: 500 });
    if (url.startsWith('/api/tenant/info')) return new Response(JSON.stringify({ id: 't1' }));
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { state, fetchMock };
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('bill status wording', () => {
  it('uses plain words and never red', () => {
    expect(billStatus('open').label).toBe('Unpaid');
    expect(billStatus('partial').label).toBe('Part paid');
    expect(billStatus('paid').tone).toBe('sage');
    for (const s of ['open', 'partial', 'paid']) expect(billStatus(s).tone).not.toBe('terra');
  });
});

describe('billing page', () => {
  it('counts only unpaid bills as still to collect, and paid today by settled date', async () => {
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    serve([bill('a', 'open'), bill('b', 'paid'), bill('c', 'paid', { settledAt: yesterday, createdAt: yesterday })]);
    render(<BillingPage />);
    expect(await screen.findByText('Guest a')).toBeTruthy();
    expect(screen.getByText('Still to collect').previousSibling?.textContent).toBe('₹500');
    expect(screen.getByText('Collected today').previousSibling?.textContent).toBe('₹500'); // only b, not c
    expect(screen.getByText('Unpaid')).toBeTruthy();
  });

  it('asks before closing a bill, and the dialog is labelled', async () => {
    const api = serve([bill('a', 'open')]);
    render(<BillingPage />);
    fireEvent.click(await screen.findByRole('button', { name: /guest a/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark as paid' });
    expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false); // nothing recorded yet
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cash received' }));
    await waitFor(() => expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(dialog.isConnected).toBe(false);
  });

  it('shows a failed payment inside the dialog instead of an alert, and keeps it open', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    serve([bill('a', 'open')], { payOk: false });
    render(<BillingPage />);
    fireEvent.click(await screen.findByRole('button', { name: /guest a/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as paid' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, cash received' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/nothing was changed/i);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('says so when the bills cannot be loaded', async () => {
    serve([], { billsOk: false });
    render(<BillingPage />);
    expect((await screen.findByRole('status')).textContent).toMatch(/couldn.t refresh/i);
  });
});
