'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserButton, useClerk } from '@clerk/nextjs';
import {
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  ConciergeBell,
  LogOut,
  RefreshCw
} from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { canOpen, crumbsFor, landingFor, navGroups, visibleNav, type StaffRole, type TenantType } from '@/lib/dashboard-nav';

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
  useEffect(() => {
    try { setIsCollapsed(localStorage.getItem('kipd-sidebar') === 'collapsed'); } catch { /* storage blocked: stay expanded */ }
  }, []);
  const toggleCollapsed = () => {
    setIsCollapsed((c) => {
      try { localStorage.setItem('kipd-sidebar', c ? 'open' : 'collapsed'); } catch { /* ignore */ }
      return !c;
    });
  };
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
      .then(res => {
        if (res.status === 401) return res.json().then(data => data) // maybe it has role?
        return res.ok ? res.json() : null;
      })
      .then(data => {
        if (data && data.error && (data.error === 'No tenant')) {
          // If no tenant but user is active, they are an admin or orphaned
          router.push('/admin/tenants');
        } else if (data) {
          setTenantType(data.type || 'both');
          setTenantName(data.name || '');
          setUserRole(data.role || 'owner');
          setUserName(data.userName || '');
        }
      })
      .catch(() => { })
      .finally(() => setIsNavReady(true));
  }, [router]);

  // The server refuses these requests anyway; this just stops someone landing on a page that is not theirs.
  const allowed = canOpen(pathname ?? '', tenantType, userRole);
  const start = landingFor(tenantType, userRole);
  useEffect(() => {
    if (isNavReady && !allowed && pathname !== start) router.replace(start);
  }, [isNavReady, allowed, pathname, start, router]);

  if (!isNavReady) {
    return <LoadingState message="Verifying your dashboard permissions..." />;
  }

  const filteredNav = visibleNav(tenantType, userRole);
  const groups = navGroups(filteredNav);

  return (
    <div className="min-h-screen bg-cream pb-20 md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-amber focus:px-4 focus:py-2 focus:text-white">Skip to content</a>

      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex fixed left-0 top-0 bottom-0 bg-white border-r border-stone-200 flex-col z-20 p-3 transition-[width] duration-200 ${isCollapsed ? 'w-[72px]' : 'w-64'}`}>
        <Link href="/dashboard" className="flex items-center gap-2.5 h-12 px-2 mb-2 rounded-lg whitespace-nowrap overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
          <span className="w-[30px] h-[30px] rounded-lg bg-amber text-white grid place-items-center flex-none"><ConciergeBell className="w-[18px] h-[18px]" aria-hidden="true" /></span>
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
              {group.area !== 'home' && (isCollapsed
                ? <div aria-hidden="true" className="mx-3 my-3 border-t border-stone-200" />
                : <p aria-hidden="true" className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted ${gi > 0 ? 'pt-4' : ''}`}>{group.label}</p>)}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname?.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? `${group.label}: ${item.name}` : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={isCollapsed ? `${group.area === 'home' ? '' : `${group.label}: `}${item.name}` : undefined}
                    className={`flex items-center gap-3 h-11 rounded-lg px-3 font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${
                      isActive ? 'bg-amber-pale text-amber-deep font-semibold' : 'text-ink-soft hover:bg-stone-100 hover:text-ink'
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
            {isCollapsed ? <PanelLeftOpen className="w-5 h-5 flex-shrink-0" aria-hidden="true" /> : <PanelLeftClose className="w-5 h-5 flex-shrink-0" aria-hidden="true" />}
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

      {/* Main Content with Pull-to-Refresh Wrapper */}
      <main
        id="main"
        className={`transition-[margin] duration-200 min-h-screen relative ${isCollapsed ? 'ml-0 md:ml-[72px]' : 'ml-0 md:ml-64'}`}
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
        {/* The transform exists only while pulling: even translateY(0) makes every `fixed` child (dialogs, toasts)
            position itself against this box instead of the window, which cut dialogs off and left the sidebar undimmed. */}
        <div style={pullY > 0 ? { transform: `translateY(${pullY * 0.5}px)` } : undefined}>
          <nav aria-label="Breadcrumb" className="hidden md:block sticky top-0 z-30 bg-cream/95 backdrop-blur border-b border-stone-200 px-8 py-2.5">
            <ol className="flex items-center flex-wrap text-sm">
              {crumbsFor(pathname, tenantType, userRole).map((c, i, all) => {
                const last = i === all.length - 1;
                return (
                  <li key={`${c.href}-${i}`} className="flex items-center">
                    {i > 0 && <ChevronRight className="w-4 h-4 mx-1 text-stone-400" aria-hidden="true" />}
                    {last
                      ? <span aria-current="page" className="px-1.5 font-semibold text-ink">{c.label}</span>
                      : <Link href={c.href} className="px-1.5 py-1 rounded-md text-ink-soft hover:bg-stone-100 hover:text-ink hover:underline underline-offset-4">{c.label}</Link>}
                  </li>
                );
              })}
            </ol>
          </nav>

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
      <nav aria-label="Main (mobile)" className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 flex items-center overflow-x-auto px-2 pb-safe z-50 h-[72px] hide-scrollbar" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`
                flex flex-col items-center justify-center min-w-[72px] h-full space-y-1 px-3 flex-shrink-0
                transition-all duration-200
                ${isActive ? 'text-amber font-bold' : 'text-ink-muted'}
              `}
            >
              <Icon className={`w-[22px] h-[22px] ${isActive ? 'scale-110' : ''} transition-transform`} />
              <span className="text-[10px] whitespace-nowrap">{item.short ?? item.name}</span>
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
