import { describe, expect, it } from 'vitest';
import { canOpen, crumbsFor, landingFor, navGroups, visibleNav } from '@/lib/dashboard-nav';

const labels = (type: Parameters<typeof visibleNav>[0], role: Parameters<typeof visibleNav>[1]) => navGroups(visibleNav(type, role)).map(g => `${g.label}: ${g.items.map(i => i.name).join(', ')}`);
const trail = (path: string, type: Parameters<typeof visibleNav>[0] = 'both', role: Parameters<typeof visibleNav>[1] = 'owner') => crumbsFor(path, type, role).map(c => c.label).join(' > ');

describe('sidebar groups', () => {
  it('an owner of a hotel and restaurant sees Home, Hotel, Restaurant and Manage', () => {
    expect(labels('both', 'owner')).toEqual([
      'Home: Home',
      'Hotel: Rooms, Bookings, Billing',
      'Restaurant: Menu, Orders, Kitchen Display, Billing',
      'Manage: Staff, Analytics, Settings',
    ]);
  });

  it('a business only sees the area it runs', () => {
    expect(labels('hotel', 'owner').join(' | ')).not.toMatch(/Restaurant/);
    expect(labels('restaurant', 'owner').join(' | ')).not.toMatch(/Hotel/);
    expect(labels('hotel', 'owner')).toContain('Hotel: Rooms, Bookings, Billing');
    expect(labels('restaurant', 'owner')).toContain('Restaurant: Menu, Orders, Kitchen Display, Billing');
  });

  it('each role sees only its own pages', () => {
    expect(labels('both', 'front_desk')).toEqual(['Home: Home', 'Hotel: Rooms, Bookings, Billing', 'Restaurant: Billing']); // the cashier for both
    expect(labels('both', 'waiter')).toEqual(['Restaurant: Orders']);
    expect(labels('both', 'kitchen')).toEqual(['Restaurant: Kitchen Display']);
    expect(labels('both', 'manager')).toEqual(labels('both', 'owner'));
  });
});

describe('where each role starts, and what it may open', () => {
  it('owner, manager and front desk start on Home; waiter on Orders; kitchen on the Kitchen Display', () => {
    expect(landingFor('both', 'owner')).toBe('/dashboard');
    expect(landingFor('both', 'manager')).toBe('/dashboard');
    expect(landingFor('both', 'front_desk')).toBe('/dashboard');
    expect(landingFor('both', 'waiter')).toBe('/dashboard/orders');
    expect(landingFor('both', 'kitchen')).toBe('/dashboard/kds');
  });

  it('keeps people off pages that are not theirs, and leaves unknown pages alone', () => {
    expect(canOpen('/dashboard', 'both', 'waiter')).toBe(false);
    expect(canOpen('/dashboard/rooms', 'both', 'waiter')).toBe(false);
    expect(canOpen('/dashboard/staff', 'both', 'front_desk')).toBe(false);
    expect(canOpen('/dashboard/orders', 'hotel', 'owner')).toBe(false); // a hotel-only business has no restaurant area
    expect(canOpen('/dashboard/rooms/anything', 'both', 'front_desk')).toBe(true);
    expect(canOpen('/dashboard/orders', 'both', 'waiter')).toBe(true);
    expect(canOpen('/dashboard/kds/3f2b8c1e-0000-4000-8000-000000000000', 'both', 'kitchen')).toBe(true);
    expect(canOpen('/dashboard/something-new', 'both', 'waiter')).toBe(true);
  });
});

describe('breadcrumbs', () => {
  it('put hotel pages under Hotel and restaurant pages under Restaurant', () => {
    expect(trail('/dashboard/rooms')).toBe('Home > Hotel > Rooms');
    expect(trail('/dashboard/bookings')).toBe('Home > Hotel > Bookings');
    expect(trail('/dashboard/orders')).toBe('Home > Restaurant > Orders');
    expect(trail('/dashboard/kds')).toBe('Home > Restaurant > Kitchen Display');
    expect(trail('/dashboard/restaurant')).toBe('Home > Restaurant > Menu');
  });

  it('billing sits under its own area', () => {
    expect(trail('/dashboard/billing/hotel')).toBe('Home > Hotel > Billing');
    expect(trail('/dashboard/billing/restaurant')).toBe('Home > Restaurant > Billing');
    expect(crumbsFor('/dashboard/billing/hotel', 'both', 'front_desk')[2]).toEqual({ label: 'Billing', href: '/dashboard/billing/hotel' });
  });

  it('a restaurant-only business bills only under Restaurant, and a hotel-only one only under Hotel', () => {
    expect(labels('restaurant', 'front_desk')).toEqual(['Home: Home', 'Restaurant: Billing']);
    expect(labels('hotel', 'front_desk')).toEqual(['Home: Home', 'Hotel: Rooms, Bookings, Billing']);
    expect(canOpen('/dashboard/billing/hotel', 'restaurant', 'owner')).toBe(false);
    expect(canOpen('/dashboard/billing/restaurant', 'hotel', 'owner')).toBe(false);
    expect(canOpen('/dashboard/billing/hotel', 'both', 'waiter')).toBe(false);
    expect(canOpen('/dashboard/billing', 'both', 'waiter')).toBe(true); // the old address only redirects
  });

  it('shared pages and Home have no area', () => {
    expect(trail('/dashboard')).toBe('Home');
    expect(trail('/dashboard/staff')).toBe('Home > Staff');
    expect(trail('/dashboard/billing')).toBe('Home > Billing'); // the old address, which just redirects
    expect(trail('/dashboard/settings')).toBe('Home > Settings');
  });

  it('keep deeper pages, and skip ids', () => {
    expect(trail('/dashboard/restaurant/qr')).toBe('Home > Restaurant > Menu > Table QR codes');
    expect(trail('/dashboard/kds/3f2b8c1e-0000-4000-8000-000000000000')).toBe('Home > Restaurant > Kitchen Display');
    expect(trail('/dashboard/something-new')).toBe('Home > Something new');
  });

  it('link Hotel and Restaurant to the first page of that area the person can open', () => {
    const hotel = crumbsFor('/dashboard/bookings', 'both', 'front_desk');
    expect(hotel[1]).toEqual({ label: 'Hotel', href: '/dashboard/rooms' });
    const restaurantAsManager = crumbsFor('/dashboard/orders', 'both', 'manager');
    expect(restaurantAsManager[1]).toEqual({ label: 'Restaurant', href: '/dashboard/restaurant' });
    const restaurantAsWaiter = crumbsFor('/dashboard/orders', 'both', 'waiter');
    expect(restaurantAsWaiter[1]).toEqual({ label: 'Restaurant', href: '/dashboard/orders' });
    expect(restaurantAsWaiter[0].href).toBe('/dashboard/orders'); // a waiter's "Home" is their own start page
  });
});
