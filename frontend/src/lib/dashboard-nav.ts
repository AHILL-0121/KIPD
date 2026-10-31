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
  area: Area;
  types: TenantType[]; // which tenant types see this item
  roles: StaffRole[]; // which roles see this item
}

const ALL: TenantType[] = ['hotel', 'restaurant', 'both'];

export const navigation: NavItem[] = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard, area: 'home', types: ALL, roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Rooms', href: '/dashboard/rooms', icon: Hotel, area: 'hotel', types: ['hotel', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar, area: 'hotel', types: ['hotel', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Menu', href: '/dashboard/restaurant', icon: UtensilsCrossed, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager'] },
  { name: 'Orders', href: '/dashboard/orders', icon: QrCode, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager', 'waiter'] },
  { name: 'Kitchen Display', href: '/dashboard/kds', icon: ChefHat, area: 'restaurant', types: ['restaurant', 'both'], roles: ['owner', 'manager', 'kitchen'] },
  // One Billing page for now. It becomes Hotel > Billing and Restaurant > Billing when billing is split (checklist 7a).
  { name: 'Billing', href: '/dashboard/billing', icon: Receipt, area: 'manage', types: ALL, roles: ['owner', 'manager', 'front_desk'] },
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
  const parts = (pathname ?? '').split('/').filter(Boolean).slice(1); // drop "dashboard"
  if (parts.length === 0) return crumbs;

  const item = navigation.find(i => i.href === `/dashboard/${parts[0]}`);
  if (item && (item.area === 'hotel' || item.area === 'restaurant')) {
    crumbs.push({ label: AREA_LABEL[item.area], href: visible.find(i => i.area === item.area)?.href ?? item.href });
  }
  let href = '/dashboard';
  parts.forEach((part, i) => {
    href += `/${part}`;
    if (UUID_START.test(part)) return;
    const label = i === 0 && item ? item.name : CRUMB_LABELS[part] ?? part.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
    crumbs.push({ label, href });
  });
  return crumbs;
}
