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
  type LucideIcon,
} from 'lucide-react';

export type TenantType = 'hotel' | 'restaurant' | 'both';
export type StaffRole = 'owner' | 'manager' | 'front_desk' | 'waiter' | 'kitchen';

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
  { name: 'Kitchen Display', href: '/dashboard/kds', icon: ChefHat, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager', 'kitchen'] },
  // Front desk collects restaurant bills too (the waiter sends them over), so they see this one as the cashier.
  { name: 'Billing', short: 'Food bills', href: '/dashboard/billing/restaurant', icon: Receipt, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Staff', href: '/dashboard/staff', icon: Users, area: 'manage', types: ALL, roles: ['owner', 'manager'] },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, area: 'manage', types: ALL, roles: ['owner', 'manager'] },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, area: 'manage', types: ALL, roles: ['owner', 'manager'] },
];

export const AREA_LABEL: Record<Area, string> = { home: 'Home', hotel: 'Hotel', restaurant: 'Restaurant', manage: 'Manage' };
const AREA_ORDER: Area[] = ['home', 'hotel', 'restaurant', 'manage'];

export const visibleNav = (type: TenantType, role: StaffRole) => navigation.filter(i => i.types.includes(type) && i.roles.includes(role));

/** The visible items in sidebar order, grouped by area. An area with nothing visible is left out. */
export function navGroups(items: NavItem[]) {
  return AREA_ORDER
    .map(area => ({ area, label: AREA_LABEL[area], items: items.filter(i => i.area === area) }))
    .filter(g => g.items.length > 0);
}

/** Where this person starts: owner, manager and front desk on Home, a waiter on Orders, kitchen on the Kitchen Display. */
export const landingFor = (type: TenantType, role: StaffRole) => visibleNav(type, role)[0]?.href ?? '/dashboard';

/** A page this person has no menu entry for is not theirs to open. Pages that are not in the menu are left alone. */
export function canOpen(pathname: string, type: TenantType, role: StaffRole) {
  const home = navigation[0];
  const item = pathname === home.href
    ? home
    : navigation.slice(1).find(i => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return !item || visibleNav(type, role).includes(item);
}

const CRUMB_LABELS: Record<string, string> = { qr: 'Table QR codes' };
const UUID_START = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * "/dashboard/rooms" is Home > Hotel > Rooms, and "/dashboard/restaurant/qr" is Home > Restaurant > Menu > Table QR codes.
 * Hotel and Restaurant link to the first page of that area this person can open. IDs in the path are skipped.
 */
export function crumbsFor(pathname: string | null, type: TenantType, role: StaffRole) {
  const visible = visibleNav(type, role);
  const crumbs = [{ label: 'Home', href: landingFor(type, role) }];
  const path = pathname ?? '/dashboard';
  if (path === '/dashboard' || path === '/dashboard/') return crumbs;

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
