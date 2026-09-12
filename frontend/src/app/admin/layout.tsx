'use client';

import { ReactNode, useState } from 'react';
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
  LogOut
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: BarChart3 },
  { name: 'Tenants', href: '/admin/tenants', icon: Building2 },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Audit Log', href: '/admin/audit', icon: AlertCircle },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const router = useRouter();
  const { signOut } = useClerk();

  return (
    <div className="min-h-screen bg-cream">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 bottom-0 bg-white border-r border-stone-200 flex flex-col z-20 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <div className={`p-6 border-b border-stone-200 flex items-center h-[88px] ${isCollapsed ? 'justify-center px-4' : 'justify-between'}`}>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <Link href="/admin" className="font-serif text-2xl font-bold text-ink block">
                Kipd
              </Link>
              <p className="text-xs text-stone-400 mt-1 uppercase tracking-wide truncate">Platform Admin</p>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-ink transition-colors flex-shrink-0"
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

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
            <UserButton afterSignOutUrl="/" />
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="text-sm font-medium text-ink truncate">Admin</div>
                  <div className="text-xs text-ink-muted">Platform Admin</div>
                </div>
                <button
                  onClick={() => signOut(() => router.push('/sign-in'))}
                  title="Log out"
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
      <main className={`transition-all duration-300 min-h-screen ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
        {children}
      </main>
    </div>
  );
}

