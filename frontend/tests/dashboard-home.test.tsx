// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import DashboardPage from '@/app/dashboard/page';

const base = {
  occupancyRate: 0, totalRooms: 0, occupiedRooms: 0, todayCheckIns: 0, todayCheckOuts: 0,
  activeOrders: 0, todayRevenue: 0, weekRevenue: 0, arrivals: [], recentOrders: [], hasProperties: true,
};

/** Answers /api/tenant/info and /api/dashboard/stats; `stats` can be swapped between refreshes. */
function serve(initial: object, role = 'owner') {
  let stats = initial;
  let statsOk = true;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/tenant/info')) return new Response(JSON.stringify({ id: 't1', type: 'both', role }));
    if (url.startsWith('/api/dashboard/stats')) return statsOk ? new Response(JSON.stringify(stats)) : new Response('{}', { status: 500 });
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { set: (s: object) => { stats = s; }, fail: () => { statsOk = false; }, fetchMock };
}

beforeEach(() => {
  vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('dashboard home', () => {
  it('a brand-new owner gets setup steps instead of a page of zeros', async () => {
    serve({ ...base, hasProperties: false });
    render(<DashboardPage />);
    expect(await screen.findByText('Set up your property')).toBeTruthy();
    expect(screen.getByRole('link', { name: /add your rooms/i }).getAttribute('href')).toBe('/dashboard/rooms');
    expect(screen.getByRole('link', { name: /invite your team/i }).getAttribute('href')).toBe('/dashboard/staff');
  });

  it('a running business sees no setup prompt, and no open orders reads as calm', async () => {
    serve({ ...base, totalRooms: 5, occupiedRooms: 2, occupancyRate: 40, todayRevenue: 1200, weekRevenue: 5000 });
    render(<DashboardPage />);
    expect(await screen.findByText('Open orders')).toBeTruthy();
    expect(screen.queryByText('Set up your property')).toBeNull();
    expect(screen.getByText('All caught up')).toBeTruthy();
    expect(screen.queryByText(/processing/i)).toBeNull();
  });

  it('open orders are called out and link to the orders screen', async () => {
    serve({ ...base, totalRooms: 5, activeOrders: 3 });
    render(<DashboardPage />);
    const note = await screen.findByText(/in progress/i);
    expect(note.closest('a')?.getAttribute('href')).toBe('/dashboard/orders');
  });

  it('shows a preparing order as neutral, not as an error', async () => {
    serve({
      ...base, totalRooms: 5,
      recentOrders: [{ id: 'o1', status: 'preparing', tableId: 'x', table: { tableNumber: 'A1' }, type: 'dine_in', totalAmount: '200', createdAt: new Date().toISOString() }],
    });
    render(<DashboardPage />);
    const badge = await screen.findByText('Preparing');
    expect(badge.className).not.toMatch(/terra/);
  });

  it('refreshes the figures on its own, and says so when it cannot', async () => {
    // Capture only the page's own 10 s refresh timer and fire it by hand; Testing Library's polling is left alone.
    const refresh: Array<() => void> = [];
    const realSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms === 10_000) { refresh.push(fn); return 0 as unknown as ReturnType<typeof setInterval>; }
      return realSetInterval(fn, ms, ...rest);
    }) as typeof setInterval);

    const api = serve({ ...base, totalRooms: 5, todayRevenue: 100 });
    render(<DashboardPage />);
    await screen.findByText('Open orders');
    expect(screen.getByText('Live updates')).toBeTruthy();
    const fire = () => refresh[refresh.length - 1](); // the effect restarts once the tenant id arrives; the last timer is the live one
    expect(refresh.length).toBeGreaterThan(0);

    api.set({ ...base, totalRooms: 5, todayRevenue: 900 });
    fire();
    await waitFor(() => expect(screen.getByText(/900/)).toBeTruthy());

    api.fail();
    fire();
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/couldn.t refresh/i));
    expect(screen.getByText(/900/)).toBeTruthy(); // keeps the last known figures
  });
});
