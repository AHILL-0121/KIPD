import {
  LayoutDashboard,
  Hotel,
  Calendar,
  UtensilsCrossed,
  Receipt,
  Users,
  BarChart3,
  Settings,
  QrCode,
  ChefHat,
  Package,
  IndianRupee,
  type LucideIcon,
} from 'lucide-react';

export type TenantType = 'hotel' | 'restaurant' | 'both';
export type StaffRole = 'owner' | 'manager' | 'front_desk' | 'waiter' | 'kitchen' | 'cashier';
export type AccessArea = 'hotel' | 'restaurant' | 'both';

/** The areas of the dashboard. Hotel and Restaurant are the two businesses; Manage is shared. */
export type Area = 'home' | 'hotel' | 'restaurant' | 'manage';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** a shorter name for the phone's bottom bar, where the area heading is not shown */
  short?: string;
  area: Area;
  types: TenantType[]; // which tenant types see this item
  roles: StaffRole[]; // which roles see this item
}

const ALL: TenantType[] = ['hotel', 'restaurant', 'both'];

export const navigation: NavItem[] = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard, area: 'home', types: ALL, roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Rooms', href: '/dashboard/rooms', icon: Hotel, area: 'hotel', types: ['hotel', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar, area: 'hotel', types: ['hotel', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Billing', short: 'Hotel bills', href: '/dashboard/billing/hotel', icon: Receipt, area: 'hotel', types: ['hotel', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Menu', href: '/dashboard/restaurant', icon: UtensilsCrossed, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager'] },
  { name: 'Orders', href: '/dashboard/orders', icon: QrCode, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager', 'waiter'] },
  { name: 'Kitchen Display', href: '/dashboard/kds', icon: ChefHat, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager', 'waiter', 'kitchen'] },
  { name: 'Inventory', href: '/dashboard/restaurant/inventory', icon: Package, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager'] },
  // Front desk collects restaurant bills too (the waiter sends them over); optional cashier role is restaurant billing only.
  { name: 'Billing', short: 'Food bills', href: '/dashboard/billing/restaurant', icon: Receipt, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager', 'front_desk', 'cashier'] },
  { name: 'Staff', href: '/dashboard/staff', icon: Users, area: 'manage', types: ALL, roles: ['owner', 'manager'] },
  { name: 'Finance', href: '/dashboard/finance', icon: IndianRupee, area: 'manage', types: ALL, roles: ['owner', 'manager'] },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, area: 'manage', types: ALL, roles: ['owner', 'manager'] },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, area: 'manage', types: ALL, roles: ['owner', 'manager'] },
];

export const AREA_LABEL: Record<Area, string> = { home: 'Home', hotel: 'Hotel', restaurant: 'Restaurant', manage: 'Manage' };
const AREA_ORDER: Area[] = ['home', 'hotel', 'restaurant', 'manage'];

export const visibleNav = (type: TenantType, role: StaffRole, areas: AccessArea = 'both') =>
  navigation.filter((i) => {
    if (!i.types.includes(type) || !i.roles.includes(role)) return false;
    if (areas === 'both' || role === 'owner' || role === 'manager') return true;
    if (i.area === 'home' || i.area === 'manage') return true;
    return i.area === areas;
  });

/** The visible items in sidebar order, grouped by area. An area with nothing visible is left out. */
export function navGroups(items: NavItem[]) {
  return AREA_ORDER
    .map(area => ({ area, label: AREA_LABEL[area], items: items.filter(i => i.area === area) }))
    .filter(g => g.items.length > 0);
}

/** Where this person starts: owner, manager and front desk on Home, a waiter on Orders, kitchen on the Kitchen Display. */
export const landingFor = (type: TenantType, role: StaffRole, areas: AccessArea = 'both') =>
  visibleNav(type, role, areas)[0]?.href ?? '/dashboard';

const NESTED_ROUTE_ALIASES: [string, string][] = [
  ['/dashboard/hotel/rooms', '/dashboard/rooms'],
  ['/dashboard/hotel/bookings', '/dashboard/bookings'],
  ['/dashboard/hotel/billing', '/dashboard/billing/hotel'],
  ['/dashboard/hotel/guests', '/dashboard/bookings'],
  ['/dashboard/restaurant/orders', '/dashboard/orders'],
  ['/dashboard/restaurant/kds', '/dashboard/kds'],
  ['/dashboard/restaurant/billing', '/dashboard/billing/restaurant'],
];

function canonicalPath(pathname: string): string {
  for (const [alias, canonical] of NESTED_ROUTE_ALIASES) {
    if (pathname === alias || pathname.startsWith(`${alias}/`)) {
      return canonical + pathname.slice(alias.length);
    }
  }
  return pathname;
}

/** A page this person has no menu entry for is not theirs to open. Pages that are not in the menu are left alone. */
export function canOpen(pathname: string, type: TenantType, role: StaffRole, areas: AccessArea = 'both') {
  const path = canonicalPath(pathname);
  if (path === '/dashboard/hotel' || path.startsWith('/dashboard/hotel/')) {
    return (
      type !== 'restaurant' &&
      ['owner', 'manager', 'front_desk'].includes(role) &&
      (role === 'owner' || role === 'manager' || areas === 'both' || areas === 'hotel')
    );
  }
  const home = navigation[0];
  const item = path === home.href
    ? home
    : navigation.slice(1).find(i => path === i.href || path.startsWith(`${i.href}/`));
  return !item || visibleNav(type, role, areas).includes(item);
}

const CRUMB_LABELS: Record<string, string> = { qr: 'Table QR codes', guests: 'Guests', inventory: 'Inventory' };
const UUID_START = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * "/dashboard/rooms" is Home > Hotel > Rooms, and "/dashboard/restaurant/qr" is Home > Restaurant > Menu > Table QR codes.
 * Hotel and Restaurant link to the first page of that area this person can open. IDs in the path are skipped.
 */
export function crumbsFor(pathname: string | null, type: TenantType, role: StaffRole, areas: AccessArea = 'both') {
  const visible = visibleNav(type, role, areas);
  const crumbs = [{ label: 'Home', href: landingFor(type, role, areas) }];
  const rawPath = pathname ?? '/dashboard';
  if (rawPath === '/dashboard' || rawPath === '/dashboard/') return crumbs;

  if (rawPath === '/dashboard/hotel') {
    crumbs.push({ label: AREA_LABEL.hotel, href: visible.find(i => i.area === 'hotel')?.href ?? '/dashboard/rooms' });
    crumbs.push({ label: 'Overview', href: '/dashboard/hotel' });
    return crumbs;
  }

  if (rawPath.startsWith('/dashboard/hotel/guests')) {
    crumbs.push({ label: AREA_LABEL.hotel, href: visible.find(i => i.area === 'hotel')?.href ?? '/dashboard/rooms' });
    crumbs.push({ label: 'Bookings', href: '/dashboard/bookings' });
    crumbs.push({ label: 'Guest profile', href: rawPath });
    return crumbs;
  }

  if (rawPath === '/dashboard/restaurant/overview' || rawPath.startsWith('/dashboard/restaurant/overview/')) {
    crumbs.push({ label: AREA_LABEL.restaurant, href: visible.find(i => i.area === 'restaurant')?.href ?? '/dashboard/restaurant' });
    crumbs.push({ label: 'Overview', href: '/dashboard/restaurant/overview' });
    return crumbs;
  }

  const path = canonicalPath(rawPath);

  // The menu page this one belongs to: the longest menu address the path starts with.
  const item = navigation.slice(1)
    .filter(i => path === i.href || path.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (item && (item.area === 'hotel' || item.area === 'restaurant')) {
    crumbs.push({ label: AREA_LABEL[item.area], href: visible.find(i => i.area === item.area)?.href ?? item.href });
  }
  if (item) crumbs.push({ label: item.name, href: item.href });

  let href = item ? item.href : '/dashboard';
  const rest = path.slice(href.length).split('/').filter(Boolean);
  for (const part of rest) {
    href += `/${part}`;
    if (UUID_START.test(part)) continue;
    crumbs.push({ label: CRUMB_LABELS[part] ?? part.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), href });
  }
  return crumbs;
}
