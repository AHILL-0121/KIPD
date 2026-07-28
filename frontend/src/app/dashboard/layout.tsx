'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserButton, useClerk } from '@clerk/nextjs';
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
  ChevronLeft,
  ChevronRight,
  LogOut,
  RefreshCw
} from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';

type TenantType = 'hotel' | 'restaurant' | 'both';
type StaffRole = 'owner' | 'manager' | 'front_desk' | 'waiter' | 'kitchen';

const ALL_ROLES: StaffRole[] = ['owner', 'manager', 'front_desk', 'waiter', 'kitchen'];

interface NavItem {
  name: string;
  href: string;
  icon: any;
  types: TenantType[];  // which tenant types see this nav item
  roles: StaffRole[];   // which roles see this nav item
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, types: ['hotel', 'restaurant', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Rooms', href: '/dashboard/rooms', icon: Hotel, types: ['hotel', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar, types: ['hotel', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Restaurant', href: '/dashboard/restaurant', icon: UtensilsCrossed, types: ['restaurant', 'both'], roles: ['owner', 'manager'] },
  { name: 'Orders', href: '/dashboard/orders', icon: QrCode, types: ['restaurant', 'both'], roles: ['owner', 'manager', 'waiter'] },
  { name: 'Kitchen Display', href: '/dashboard/kds', icon: ChefHat, types: ['restaurant', 'both'], roles: ['owner', 'manager', 'kitchen'] },
  { name: 'Billing', href: '/dashboard/billing', icon: Receipt, types: ['hotel', 'restaurant', 'both'], roles: ['owner', 'manager', 'front_desk'] },
  { name: 'Staff', href: '/dashboard/staff', icon: Users, types: ['hotel', 'restaurant', 'both'], roles: ['owner', 'manager'] },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, types: ['hotel', 'restaurant', 'both'], roles: ['owner', 'manager'] },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, types: ['hotel', 'restaurant', 'both'], roles: ['owner', 'manager'] },
];

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front Desk',
  waiter: 'Waiter',
  kitchen: 'Kitchen Staff',
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [tenantType, setTenantType] = useState<TenantType>('both');
  const [tenantName, setTenantName] = useState('');
  const [userRole, setUserRole] = useState<StaffRole>('owner');
  const [userName, setUserName] = useState('');
  const [isNavReady, setIsNavReady] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const router = useRouter();
  const { signOut } = useClerk();

  // Mobile Pull-to-Refresh State
  const [startY, setStartY] = useState(0);
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY > 0) {
      const currentY = e.touches[0].clientY;
      const pullDistance = Math.max(0, currentY - startY);
      if (pullDistance > 0 && pullDistance < 150) {
        setPullY(pullDistance);
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullY > 100) {
      setIsRefreshing(true);
      window.location.reload();
    }
    setStartY(0);
    setPullY(0);
  };

  useEffect(() => {
    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setTenantType(data.type || 'both');
          setTenantName(data.name || '');
          setUserRole(data.role || 'owner');
          setUserName(data.userName || '');
        }
      })
      .catch(() => { })
      .finally(() => setIsNavReady(true));
  }, []);

  if (!isNavReady) {
    return <LoadingState message="Verifying your dashboard permissions..." />;
  }

  const filteredNav = navigation.filter(
    item => item.types.includes(tenantType) && item.roles.includes(userRole)
  );

  return (
    <div className="min-h-screen bg-cream pb-20 md:pb-0">
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex fixed left-0 top-0 bottom-0 bg-white border-r border-stone-200 flex-col z-20 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <div className={`p-6 border-b border-stone-200 flex items-center h-[88px] ${isCollapsed ? 'justify-center px-4' : 'justify-between'}`}>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <Link href="/dashboard" className="font-serif text-2xl font-bold text-ink block">
                Kipd
              </Link>
              <p className="text-xs text-stone-400 mt-1 truncate">{tenantName || 'Your Property'}</p>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-ink transition-colors flex-shrink-0"
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto overflow-x-hidden">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                title={isCollapsed ? item.name : undefined}
                className={`
                  flex items-center gap-3 py-3 rounded-xl
                  transition-all duration-200
                  ${isActive
                    ? 'bg-amber text-ink font-medium shadow-sm'
                    : 'text-ink-muted hover:bg-stone-100 hover:text-ink'
                  }
                  ${isCollapsed ? 'justify-center px-0' : 'px-4'}
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-200 h-[76px] flex items-center">
          <div className={`flex items-center gap-3 w-full ${isCollapsed ? 'justify-center' : 'px-2'}`}>
            <UserButton afterSignOutUrl="/sign-in" />
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="text-sm font-medium text-ink truncate">{userName || 'User'}</div>
                  <div className="text-xs text-ink-muted">{ROLE_LABELS[userRole] || userRole}</div>
                </div>
                <button
                  onClick={() => signOut(() => router.push('/sign-in'))}
                  title="Log out"
                  className="hidden md:flex p-2 text-stone-400 hover:text-terra hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                >
                  <LogOut className="w-[18px] h-[18px]" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content with Pull-to-Refresh Wrapper */}
      <main
        className={`transition-all duration-300 min-h-screen relative ${isCollapsed ? 'ml-0 md:ml-20' : 'ml-0 md:ml-64'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull Indicator Layer */}
        {(pullY > 0 || isRefreshing) && (
          <div
            className="absolute top-0 left-0 right-0 flex justify-center items-center overflow-hidden transition-all pointer-events-none z-50 text-stone-400"
            style={{ height: pullY > 0 ? pullY : (isRefreshing ? 60 : 0) }}
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-amber' : (pullY > 100 ? 'text-sage' : '')}`}
              style={{ transform: `rotate(${pullY * 2.5}deg)` }}
            />
          </div>
        )}


        {/* Main Route Children */}
        <div style={{ transform: `translateY(${pullY * 0.5}px)`, transition: pullY === 0 ? 'transform 0.3s ease-out' : 'none' }}>
          {/* Mobile Profile & Role Identity Banner */}
          <div className="md:hidden px-4 pt-5 pb-0 flex items-center gap-2 text-[11px] font-mono tracking-wide uppercase text-ink-muted/80 z-40">
            <span>{userName || 'Staff'}</span>
            <span className="w-1 h-1 rounded-full bg-stone-300" />
            <span className="text-amber font-semibold">{ROLE_LABELS[userRole] || userRole}</span>
          </div>

          {children}
        </div>
      </main>

      {/* Bottom Navigation - Mobile (Horizontally Scrollable) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 flex items-center overflow-x-auto px-2 pb-safe z-50 h-[72px] hide-scrollbar" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                flex flex-col items-center justify-center min-w-[72px] h-full space-y-1 px-3 flex-shrink-0
                transition-all duration-200
                ${isActive ? 'text-amber font-bold' : 'text-ink-muted'}
              `}
            >
              <Icon className={`w-[22px] h-[22px] ${isActive ? 'scale-110' : ''} transition-transform`} />
              <span className="text-[10px] whitespace-nowrap">{item.name}</span>
            </Link>
          );
        })}
        {/* Mobile Log Out System */}
        <div aria-hidden="true" className="w-[1px] h-8 bg-stone-200 mx-1 flex-shrink-0" />
        <button
          onClick={() => signOut(() => router.push('/sign-in'))}
          className="flex flex-col items-center justify-center min-w-[72px] h-full space-y-1 px-3 flex-shrink-0 text-stone-400 hover:text-terra transition-colors"
        >
          <LogOut className="w-[22px] h-[22px]" />
          <span className="text-[10px] whitespace-nowrap">Log Out</span>
        </button>
      </nav>
    </div>
  );
}
