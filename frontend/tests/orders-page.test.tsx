// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrdersPage from '@/app/dashboard/orders/page';
import { orderStatus } from '@/lib/order-status';

const table = { id: 'tb1', tableNumber: 'A1', capacity: 4 };
const ticket = (id: string, status: string, extra = {}) => ({
  id, type: 'dine_in', tableId: 'tb1', status, totalAmount: '200', createdAt: new Date().toISOString(),
  orderItems: [{ id: `${id}-i`, quantity: 1, price: '200', menuItem: { id: 'm1', name: 'Chilli Chicken', price: '200' } }], ...extra,
});

function serve(orders: unknown[], opts: { ordersOk?: boolean } = {}) {
  const state = { ordersOk: opts.ordersOk ?? true };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/orders') && !init?.method) return state.ordersOk ? new Response(JSON.stringify(orders)) : new Response('{}', { status: 500 });
    if (url.startsWith('/api/tables')) return new Response(JSON.stringify([table]));
    if (url.startsWith('/api/menu')) return new Response(JSON.stringify([{ id: 'm1', name: 'Chilli Chicken', price: '200', isAvailable: true }]));
    if (url.startsWith('/api/tenant/info')) return new Response(JSON.stringify({ id: 't1', role: 'waiter' }));
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { state, fetchMock };
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('order status wording', () => {
  it('only cancelled is red; a normal step never looks like an error', () => {
    for (const s of ['new', 'acknowledged', 'preparing', 'ready', 'served', 'closed']) {
      expect(orderStatus(s).tone).not.toBe('terra');
    }
    expect(orderStatus('cancelled').tone).toBe('terra');
    expect(orderStatus('something_new').label).toBe('Something_new'); // unknown statuses are shown, not mislabelled
  });
});

describe('orders page', () => {
  it('names the table, hides settled tabs, and shows a preparing ticket as neutral', async () => {
    serve([ticket('o1', 'preparing'), ticket('o2', 'closed')]);
    render(<OrdersPage />);
    expect(await screen.findByRole('heading', { name: 'Table A1' })).toBeTruthy();
    expect(screen.getByText('1 ticket sent to the kitchen')).toBeTruthy(); // the closed one is not on the tab
    expect(screen.queryByText(/table tab opened/i)).toBeNull();
    expect(screen.getByText('Preparing').className).not.toMatch(/terra/);
  });

  it('settling a bill is a normal action, not a danger-coloured one', async () => {
    serve([ticket('o1', 'served')]);
    render(<OrdersPage />);
    const settle = await screen.findByRole('button', { name: /settle bill/i });
    expect(settle.className).not.toMatch(/terra/);
  });

  it('the send-to-kitchen sheet is a labelled dialog and Escape closes it', async () => {
    serve([ticket('o1', 'served')]);
    render(<OrdersPage />);
    fireEvent.click(await screen.findByRole('button', { name: /add more items/i }));
    const dialog = await screen.findByRole('dialog', { name: /send to kitchen/i });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says so when the orders cannot be loaded', async () => {
    const api = serve([ticket('o1', 'served')]);
    api.state.ordersOk = false;
    render(<OrdersPage />);
    // the load failed: the page explains instead of looking like an empty, healthy restaurant
    expect((await screen.findByRole('status')).textContent).toMatch(/couldn.t refresh/i);
  });
});
