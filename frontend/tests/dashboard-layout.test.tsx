// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

let pathname = '/dashboard/rooms';
const replace = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn(), replace }) }));
vi.mock('@clerk/nextjs', () => ({ UserButton: () => null, useClerk: () => ({ signOut: vi.fn() }) }));

import DashboardLayout from '@/app/dashboard/layout';

function signedInAs(role: string, type = 'both') {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 't1', name: 'Orchid Bay', type, role, userName: 'Meera Rao' }))));
}
const sidebar = () => screen.getByRole('navigation', { name: 'Main' });

beforeEach(() => { replace.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('dashboard layout', () => {
  it('groups the sidebar by area and shows Home > Hotel > Rooms', async () => {
    pathname = '/dashboard/rooms';
    signedInAs('owner');
    render(<DashboardLayout><p>page</p></DashboardLayout>);
    await within(await screen.findByRole('navigation', { name: 'Main' })).findByRole('group', { name: 'Hotel' });
    expect(within(sidebar()).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Home', 'Hotel', 'Restaurant', 'Manage']);
    expect(within(within(sidebar()).getByRole('group', { name: 'Hotel' })).getAllByRole('link').map(l => l.textContent)).toEqual(['Rooms', 'Bookings']);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Home', 'Hotel', 'Rooms']);
    expect(within(crumbs).getByText('Rooms').getAttribute('aria-current')).toBe('page');
    expect(replace).not.toHaveBeenCalled();
  });

  it('a hotel-only business has no Restaurant area', async () => {
    pathname = '/dashboard/bookings';
    signedInAs('owner', 'hotel');
    render(<DashboardLayout><p>page</p></DashboardLayout>);
    await within(await screen.findByRole('navigation', { name: 'Main' })).findByRole('group', { name: 'Hotel' });
    expect(within(sidebar()).queryByRole('group', { name: 'Restaurant' })).toBeNull();
  });

  it('sends a waiter who opens a hotel page to Orders', async () => {
    pathname = '/dashboard/rooms';
    signedInAs('waiter');
    render(<DashboardLayout><p>page</p></DashboardLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/orders'));
    expect(within(sidebar()).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Restaurant']);
  });

  it('leaves a waiter on their own page', async () => {
    pathname = '/dashboard/orders';
    signedInAs('waiter');
    render(<DashboardLayout><p>page</p></DashboardLayout>);
    await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Home', 'Restaurant', 'Orders']);
    expect(replace).not.toHaveBeenCalled();
  });
});
