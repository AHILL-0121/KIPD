'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserButton, useClerk } from '@clerk/nextjs';
import {
  Building2,
  Users,
  BarChart3,
  Settings,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Inbox,
  Activity,
  Menu,
  X,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: BarChart3 },
  { name: 'Tenants', href: '/admin/tenants', icon: Building2 },
  { name: 'Requests', href: '/admin/requests', icon: Inbox },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Audit Log', href: '/admin/audit', icon: AlertCircle },
  { name: 'System', href: '/admin/system', icon: Activity },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const { signOut } = useClerk();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isNavActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="min-h-screen bg-cream">
      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-30 h-14 bg-white border-b border-stone-200 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open admin navigation"
            className="p-2 -ml-2 rounded-lg text-ink hover:bg-stone-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <Link href="/admin" className="font-serif text-lg font-bold text-ink">
              Kipd
            </Link>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Platform Admin
            </span>
          </div>
        </div>
        <UserButton afterSignOutUrl="/sign-in" />
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-xl z-10">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <div className="font-serif text-xl font-bold text-ink">Kipd</div>
                <p className="text-[11px] uppercase tracking-wider text-ink-muted">Platform Admin</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close admin navigation"
                className="p-2 rounded-lg text-ink-muted hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      active ? 'bg-amber-pale text-amber-deep font-semibold' : 'text-ink-muted hover:bg-stone-100 hover:text-ink'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t border-stone-200">
              <button
                type="button"
                onClick={() => signOut(() => router.push('/sign-in'))}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-stone-200 text-terra hover:bg-red-50 text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex fixed left-0 top-0 bottom-0 bg-white border-r border-stone-200 flex-col z-20 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div
          className={`p-6 border-b border-stone-200 flex items-center h-[88px] ${
            isCollapsed ? 'justify-center px-4' : 'justify-between'
          }`}
        >
          {!isCollapsed && (
            <div className="overflow-hidden">
              <Link href="/admin" className="font-serif text-2xl font-bold text-ink block">
                Kipd
              </Link>
              <p className="text-xs text-stone-400 mt-1 uppercase tracking-wide truncate">Platform Admin</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-ink transition-colors flex-shrink-0"
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = isNavActive(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                title={isCollapsed ? item.name : undefined}
                className={`
                  flex items-center gap-3 py-3 rounded-xl
                  transition-all duration-200
                  ${isActive
                    ? 'bg-amber-pale text-amber-deep font-semibold'
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
                  <div className="text-sm font-medium text-ink truncate">Admin</div>
                  <div className="text-xs text-ink-muted">Platform Admin</div>
                </div>
                <button
                  onClick={() => signOut(() => router.push('/sign-in'))}
                  title="Log out"
                  aria-label="Log out"
                  className="p-2 text-stone-400 hover:text-terra hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                >
                  <LogOut className="w-[18px] h-[18px]" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 min-h-screen ${isCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {children}
      </main>
    </div>
  );
}
