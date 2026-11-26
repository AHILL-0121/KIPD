// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
    expect(within(within(sidebar()).getByRole('group', { name: 'Hotel' })).getAllByRole('link').map(l => l.textContent)).toEqual(['Rooms', 'Bookings', 'Billing']);
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

  it('shows human user name in mobile identity banner but hides email addresses', async () => {
    pathname = '/dashboard/orders';
    signedInAs('owner');
    const { unmount } = render(<DashboardLayout><p>page</p></DashboardLayout>);
    await screen.findByRole('navigation', { name: 'Breadcrumb' });
    // Both desktop sidebar and mobile banner render the human name
    expect(screen.getAllByText('Meera Rao').length).toBe(2);
    unmount();

    // When userName is an email address fallback:
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 't1', name: 'Orchid Bay', type: 'both', role: 'owner', userName: 'sa.education5211@gmail.com' }))));
    render(<DashboardLayout><p>page</p></DashboardLayout>);
    await screen.findByRole('navigation', { name: 'Breadcrumb' });
    // Only desktop sidebar renders the email, mobile banner suppresses it
    expect(screen.getAllByText('sa.education5211@gmail.com').length).toBe(1);
  });

  it('opens mobile More drawer cleanly with all secondary nav items including Analytics and Settings', async () => {
    pathname = '/dashboard';
    signedInAs('owner');
    render(<DashboardLayout><p>page</p></DashboardLayout>);
    const moreBtn = await screen.findByRole('button', { name: 'More navigation options' });
    fireEvent.click(moreBtn);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Analytics')).toBeTruthy();
    expect(within(dialog).getByText('Settings')).toBeTruthy();
    expect(within(dialog).getByText('Log out')).toBeTruthy();
    expect(within(dialog).getByRole('combobox', { name: 'Language' })).toBeTruthy();
  });

  it('redirects a non-impersonating platform admin straight to /admin without rendering Kitchen fallback', async () => {
    pathname = '/dashboard';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: '', name: '', type: 'both', role: 'platform_admin', userName: 'Admin', isPlatformAdmin: true }))
      )
    );
    render(<DashboardLayout><p>page</p></DashboardLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
    expect(screen.queryByText('Kitchen Display')).toBeNull();
    expect(screen.queryByText('Your property')).toBeNull();
  });

  it('shows a clean no-workspace screen on 401 instead of falling back to Kitchen role', async () => {
    pathname = '/dashboard';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'No tenant' }), { status: 401 })));
    render(<DashboardLayout><p>page</p></DashboardLayout>);
    expect(await screen.findByText('No workspace assigned')).toBeTruthy();
    expect(screen.queryByText('Kitchen Display')).toBeNull();
    expect(replace).not.toHaveBeenCalledWith('/sign-in');
  });
});
