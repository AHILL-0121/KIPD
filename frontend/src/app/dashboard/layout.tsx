'use client';

import { ReactNode, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserButton, useClerk } from '@clerk/nextjs';
import {
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  ConciergeBell,
  LogOut,
  RefreshCw,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { Dialog } from '@/components/ui/dialog';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import {
  canOpen,
  crumbsFor,
  landingFor,
  navGroups,
  visibleNav,
  type StaffRole,
  type TenantType,
  type AccessArea,
  type NavItem,
} from '@/lib/dashboard-nav';
import { TenantProvider, useTenantInfo } from '@/contexts/tenant-context';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front Desk',
  waiter: 'Waiter',
  kitchen: 'Kitchen Staff',
};

function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useClerk();
  const { info, isLoading } = useTenantInfo();

  const tenantType: TenantType = (info?.type as TenantType) || 'both';
  const tenantName = info?.name || '';
  const userRole: StaffRole = (info?.role as StaffRole) || 'kitchen';
  const userAreas: AccessArea = (info?.areas as AccessArea) || 'both';
  const userName = info?.userName || '';

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showMoreNav, setShowMoreNav] = useState(false);

  useEffect(() => {
    try {
      setIsCollapsed(localStorage.getItem('kipd-sidebar') === 'collapsed');
    } catch {
      /* storage blocked: stay expanded */
    }
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((c) => {
      try {
        localStorage.setItem('kipd-sidebar', c ? 'open' : 'collapsed');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

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

  // The server refuses these requests anyway; this just stops someone landing on a page that is not theirs.
  const allowed = canOpen(pathname ?? '', tenantType, userRole, userAreas);
  const start = landingFor(tenantType, userRole, userAreas);

  useEffect(() => {
    if (isLoading) return;
    if (!info) {
      router.replace('/sign-in');
      return;
    }
    // Handle "No tenant" error — redirect admins/orphaned users to admin
    if ((info as any).error === 'No tenant') {
      router.push('/admin/tenants');
      return;
    }
    if (!allowed && pathname !== start) {
      router.replace(start);
    }
  }, [isLoading, info, allowed, pathname, start, router]);

  const filteredNav = visibleNav(tenantType, userRole, userAreas);
  const groups = navGroups(filteredNav);

  // Derive the 4-tab mobile navigation:
  // If nav items <= 4, show them directly.
  // If > 4, select top 3 primary items + 1 "More" button with a drawer.
  const { primaryMobileTabs, moreMobileItems, isMoreActive } = useMemo(() => {
    if (filteredNav.length <= 4) {
      return {
        primaryMobileTabs: filteredNav,
        moreMobileItems: [] as NavItem[],
        isMoreActive: false,
      };
    }

    // Pick top 3 priority tabs:
    // 1. Home
    const homeItem = filteredNav.find((n) => n.href === '/dashboard');
    // 2. Orders or KDS
    const ordersItem =
      filteredNav.find((n) => n.href === '/dashboard/orders') ||
      filteredNav.find((n) => n.href === '/dashboard/kds');
    // 3. Rooms or Bookings or Billing
    const hotelOrBillingItem =
      filteredNav.find((n) => n.href === '/dashboard/rooms') ||
      filteredNav.find((n) => n.href === '/dashboard/bookings') ||
      filteredNav.find((n) => n.href.startsWith('/dashboard/billing'));

    const primaryHrefs = new Set<string>();
    const topThree: NavItem[] = [];

    if (homeItem) {
      topThree.push(homeItem);
      primaryHrefs.add(homeItem.href);
    }
    if (ordersItem && !primaryHrefs.has(ordersItem.href)) {
      topThree.push(ordersItem);
      primaryHrefs.add(ordersItem.href);
    }
    if (hotelOrBillingItem && !primaryHrefs.has(hotelOrBillingItem.href)) {
      topThree.push(hotelOrBillingItem);
      primaryHrefs.add(hotelOrBillingItem.href);
    }

    // Fill up to 3 if any priority slots were missing
    for (const item of filteredNav) {
      if (topThree.length >= 3) break;
      if (!primaryHrefs.has(item.href)) {
        topThree.push(item);
        primaryHrefs.add(item.href);
      }
    }

    const moreItems = filteredNav.filter((n) => !primaryHrefs.has(n.href));
    const isMoreActive = moreItems.some((n) =>
      n.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(n.href)
    );

    return {
      primaryMobileTabs: topThree,
      moreMobileItems: moreItems,
      isMoreActive,
    };
  }, [filteredNav, pathname]);

  if (isLoading) {
    return <LoadingState message="Verifying your dashboard permissions..." />;
  }

  return (
    <div className="min-h-screen bg-cream pb-20 md:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-amber focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* Sidebar - Desktop */}
      <aside
        className={`hidden md:flex fixed left-0 top-0 bottom-0 bg-white border-r border-stone-200 flex-col z-20 p-3 transition-[width] duration-200 ${
          isCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 h-12 px-2 mb-2 rounded-lg whitespace-nowrap overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
        >
          <span className="w-[30px] h-[30px] rounded-lg bg-amber text-white grid place-items-center flex-none">
            <ConciergeBell className="w-[18px] h-[18px]" aria-hidden="true" />
          </span>
          {!isCollapsed && (
            <span className="min-w-0">
              <b className="block text-[1.1875rem] leading-5 font-bold tracking-tight text-ink">Kipd</b>
              <span className="block text-xs text-ink-muted truncate">{tenantName || 'Your property'}</span>
            </span>
          )}
        </Link>

        <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden">
          {groups.map((group, gi) => (
            <div key={group.area} role="group" aria-label={group.label} className="space-y-1">
              {/* Home has no heading; the other areas are labelled, or just separated when the sidebar is collapsed */}
              {group.area !== 'home' &&
                (isCollapsed ? (
                  <div aria-hidden="true" className="mx-3 my-3 border-t border-stone-200" />
                ) : (
                  <p
                    aria-hidden="true"
                    className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted ${
                      gi > 0 ? 'pt-4' : ''
                    }`}
                  >
                    {group.label}
                  </p>
                ))}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? `${group.label}: ${item.name}` : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={
                      isCollapsed
                        ? `${group.area === 'home' ? '' : `${group.label}: `}${item.name}`
                        : undefined
                    }
                    className={`flex items-center gap-3 h-11 rounded-lg px-3 font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${
                      isActive
                        ? 'bg-amber-pale text-amber-deep font-semibold'
                        : 'text-ink-soft hover:bg-stone-100 hover:text-ink'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                    {!isCollapsed && <span className="overflow-hidden">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-stone-200 pt-3 space-y-1.5">
          <button
            onClick={toggleCollapsed}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex items-center gap-3 h-10 w-full rounded-lg px-3 font-medium text-ink-soft hover:bg-stone-100 hover:text-ink whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            )}
            {!isCollapsed && <span>Collapse</span>}
          </button>
          <div className={`flex items-center gap-3 px-2 py-1 ${isCollapsed ? 'justify-center' : ''}`}>
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
                  aria-label="Log out"
                  className="p-2 text-ink-muted hover:text-terra hover:bg-terra-pale rounded-lg transition-colors flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
                >
                  <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content with Pull-to-Refresh Wrapper and ErrorBoundary */}
      <main
        id="main"
        className={`transition-[margin] duration-200 min-h-screen relative ${
          isCollapsed ? 'ml-0 md:ml-[72px]' : 'ml-0 md:ml-64'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull Indicator Layer */}
        {(pullY > 0 || isRefreshing) && (
          <div
            className="absolute top-0 left-0 right-0 flex justify-center items-center overflow-hidden transition-all pointer-events-none z-50 text-stone-400"
            style={{ height: pullY > 0 ? pullY : isRefreshing ? 60 : 0 }}
          >
            <RefreshCw
              className={`w-5 h-5 ${
                isRefreshing ? 'animate-spin text-amber' : pullY > 100 ? 'text-sage' : ''
              }`}
              style={{ transform: `rotate(${pullY * 2.5}deg)` }}
            />
          </div>
        )}

        {/* Main Route Children wrapped in ErrorBoundary */}
        <div style={pullY > 0 ? { transform: `translateY(${pullY * 0.5}px)` } : undefined}>
          <nav
            aria-label="Breadcrumb"
            className="hidden md:block sticky top-0 z-30 bg-cream/95 backdrop-blur border-b border-stone-200 px-8 py-2.5"
          >
            <ol className="flex items-center flex-wrap text-sm">
              {crumbsFor(pathname, tenantType, userRole, userAreas).map((c, i, all) => {
                const last = i === all.length - 1;
                return (
                  <li key={`${c.href}-${i}`} className="flex items-center">
                    {i > 0 && <ChevronRight className="w-4 h-4 mx-1 text-stone-400" aria-hidden="true" />}
                    {last ? (
                      <span aria-current="page" className="px-1.5 font-semibold text-ink">
                        {c.label}
                      </span>
                    ) : (
                      <Link
                        href={c.href}
                        className="px-1.5 py-1 rounded-md text-ink-soft hover:bg-stone-100 hover:text-ink hover:underline underline-offset-4"
                      >
                        {c.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Mobile Profile & Role Identity Banner */}
          <div className="md:hidden px-4 pt-5 pb-0 flex items-center justify-between text-[11px] font-mono tracking-wide uppercase text-ink-muted/80 z-40">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-ink truncate">{tenantName || 'Property'}</span>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span className="text-amber font-semibold">{ROLE_LABELS[userRole] || userRole}</span>
            </div>
            <span className="text-ink-muted text-[10px]">{userName}</span>
          </div>

          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>

      {/* 4-Tab Mobile Navigation */}
      <nav
        aria-label="Main (mobile)"
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 flex items-center justify-around px-2 pb-safe z-50 h-[64px] shadow-[0_-2px_10px_rgba(0,0,0,0.04)]"
      >
        {primaryMobileTabs.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`
                flex-1 flex flex-col items-center justify-center min-h-[48px] h-full space-y-1 px-1 transition-all
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber
                ${isActive ? 'text-amber-deep font-bold' : 'text-ink-muted hover:text-ink'}
              `}
            >
              <Icon
                className={`w-[22px] h-[22px] transition-transform ${isActive ? 'scale-110' : ''}`}
                aria-hidden="true"
              />
              <span className="text-[11px] leading-tight text-center truncate max-w-[72px]">
                {item.short ?? item.name}
              </span>
            </Link>
          );
        })}

        {/* More... Tab (if more items exist) */}
        {moreMobileItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMoreNav(true)}
            aria-expanded={showMoreNav}
            aria-label="More navigation options"
            className={`
              flex-1 flex flex-col items-center justify-center min-h-[48px] h-full space-y-1 px-1 transition-all
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber
              ${isMoreActive ? 'text-amber-deep font-bold' : 'text-ink-muted hover:text-ink'}
            `}
          >
            <div className="relative">
              <MoreHorizontal
                className={`w-[22px] h-[22px] transition-transform ${isMoreActive ? 'scale-110' : ''}`}
                aria-hidden="true"
              />
              {isMoreActive && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber" />
              )}
            </div>
            <span className="text-[11px] leading-tight text-center">More</span>
          </button>
        )}
      </nav>

      {/* More... Drawer Modal (Mobile Sheet) */}
      <Dialog
        open={showMoreNav}
        onClose={() => setShowMoreNav(false)}
        variant="drawer"
        labelledBy="more-nav-title"
      >
        <div className="flex flex-col h-full bg-white max-h-[85vh]">
          {/* Drawer Header */}
          <div className="flex items-center justify-between p-5 border-b border-stone-200 shrink-0">
            <div>
              <h2 id="more-nav-title" className="text-xl font-bold text-ink">
                {tenantName || 'Property Menu'}
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                {userName ? `${userName} (${ROLE_LABELS[userRole] || userRole})` : ROLE_LABELS[userRole] || userRole}
              </p>
            </div>
            <button
              onClick={() => setShowMoreNav(false)}
              aria-label="Close menu"
              className="min-h-[44px] min-w-[44px] p-2.5 rounded-full text-ink-muted hover:bg-stone-100 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Drawer Navigation Links */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {navGroups(moreMobileItems).map((group) => (
              <div key={group.area} className="space-y-1">
                <p className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === '/dashboard'
                      ? pathname === '/dashboard'
                      : pathname?.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setShowMoreNav(false)}
                      className={`
                        flex items-center gap-3.5 min-h-[48px] px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors
                        ${
                          isActive
                            ? 'bg-amber-pale text-amber-deep font-bold'
                            : 'text-ink hover:bg-stone-100'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0 text-amber-deep" aria-hidden="true" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Drawer Footer / Log out */}
          <div className="p-4 border-t border-stone-200 bg-stone-50 shrink-0">
            <button
              onClick={() => signOut(() => router.push('/sign-in'))}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white font-semibold text-terra hover:bg-terra-pale transition-colors py-3"
            >
              <LogOut className="w-5 h-5" aria-hidden="true" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <TenantProvider>
      <DashboardShell>{children}</DashboardShell>
    </TenantProvider>
  );
}
