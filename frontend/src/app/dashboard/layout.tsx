'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
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
  ChefHat
} from 'lucide-react';

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
      .catch(() => {});
  }, []);

  const filteredNav = navigation.filter(
    item => item.types.includes(tenantType) && item.roles.includes(userRole)
  );

  return (
    <div className="min-h-screen bg-cream">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-stone-200 flex flex-col">
        <div className="p-6 border-b border-stone-200">
          <Link href="/dashboard" className="font-serif text-2xl font-bold text-ink block">
            Kipd
          </Link>
          <p className="text-xs text-stone-400 mt-1">{tenantName || 'Your Property'}</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
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
                  flex items-center gap-3 px-4 py-3 rounded-xl
                  transition-all duration-200
                  ${isActive 
                    ? 'bg-amber text-ink font-medium shadow-sm' 
                    : 'text-ink-muted hover:bg-stone-100 hover:text-ink'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-stone-200">
          <div className="flex items-center gap-3 px-2">
            <UserButton afterSignOutUrl="/" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink truncate">{userName || 'User'}</div>
              <div className="text-xs text-ink-muted">{ROLE_LABELS[userRole] || userRole}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
}
