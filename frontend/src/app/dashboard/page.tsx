'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Hotel, Calendar, UtensilsCrossed, IndianRupee, ArrowRight, Users, BedDouble } from 'lucide-react';
import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { LoadingState } from '@/components/ui/loading-state';
import { formatCurrency } from '@/lib/currency';
import { useLive } from '@/lib/use-live';
import { orderStatus } from '@/lib/order-status';

type TenantType = 'hotel' | 'restaurant' | 'both';

interface DashboardStats {
  occupancyRate: number;
  totalRooms: number;
  occupiedRooms: number;
  todayCheckIns: number;
  todayCheckOuts: number;
  activeOrders: number;
  todayRevenue: number;
  weekRevenue: number;
  arrivals?: any[];
  recentOrders?: any[];
  hasProperties: boolean;
}

const EMPTY: DashboardStats = {
  occupancyRate: 0, totalRooms: 0, occupiedRooms: 0, todayCheckIns: 0, todayCheckOuts: 0,
  activeOrders: 0, todayRevenue: 0, weekRevenue: 0, arrivals: [], recentOrders: [], hasProperties: false,
};

function StatCard({ href, icon, tone, value, label, note }: {
  href?: string;
  icon: ReactNode;
  tone: 'amber' | 'sage' | 'stone';
  value: ReactNode;
  label: string;
  note: ReactNode;
}) {
  const body = (
    <Card hover={false} className="h-full">
      <CardIcon variant={tone}>{icon}</CardIcon>
      <div className="text-3xl font-bold text-ink mb-1">{value}</div>
      <div className="text-sm font-medium text-ink-soft">{label}</div>
      <div className="text-xs text-ink-muted mt-1.5">{note}</div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber">
      {body}
    </Link>
  ) : body;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY);
  const [tenantType, setTenantType] = useState<TenantType>('both');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const showHotel = tenantType === 'hotel' || tenantType === 'both';
  const showRestaurant = tenantType === 'restaurant' || tenantType === 'both';
  const router = useRouter();

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (res.status === 401) { setError('NO_TENANT'); return; }
      if (!res.ok) throw new Error('Failed to fetch stats');
      setStats(await res.json());
      setStale(false);
    } catch (err) {
      console.error(err);
      setStale(true); // keep showing the last figures, but say they may be out of date
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    // Fetch the tenant type and the user's role first: kitchen and waiter staff have their own home screen.
    fetch('/api/tenant/info')
      .then(res => res.json())
      .then(data => {
        if (data.role === 'kitchen') { router.replace('/dashboard/kds'); return; }
        if (data.role === 'waiter') { router.replace('/dashboard/orders'); return; }
        if (data.type) setTenantType(data.type);
        if (data.id) setTenantId(data.id);
        loadStats();
      })
      .catch((err) => {
        console.error(err);
        setIsReady(true);
      });
  }, [router, loadStats]);

  // The "Live updates" badge below is only true if the figures really refresh.
  useLive(loadStats, tenantId);

  if (!isReady) {
    return <LoadingState message="Loading your operational metrics..." />;
  }

  if (error === 'NO_TENANT') {
    return (
      <div className="p-4 md:p-8 overflow-x-hidden">
        <Card className="p-12 text-center">
          <Hotel className="w-16 h-16 mx-auto mb-4 text-ink-muted" aria-hidden="true" />
          <h2 className="text-2xl font-bold text-ink mb-2">No Tenant Assigned</h2>
          <p className="text-ink-muted mb-6">
            You need to be assigned to a tenant (hotel/restaurant) to view dashboard data.
            Please contact your platform administrator.
          </p>
          <p className="text-sm text-ink-muted">
            If you are a platform administrator, you can{' '}
            <a href="/admin/tenants" className="text-amber hover:underline font-medium">
              create or manage tenants here
            </a>
            .
          </p>
        </Card>
      </div>
    );
  }

  const cardCount = (showHotel ? 2 : 0) + (showRestaurant ? 1 : 0) + 1;
  const statCols = cardCount === 4 ? 'xl:grid-cols-4' : cardCount === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';
  const panelCols = showHotel && showRestaurant ? 'lg:grid-cols-2' : 'lg:grid-cols-1';
  const brandNew = !stats.hasProperties || (
    stats.totalRooms === 0 && !stats.recentOrders?.length && stats.todayRevenue === 0 && stats.weekRevenue === 0
  );

  const steps = [
    showHotel && { href: '/dashboard/rooms', icon: BedDouble, title: 'Add your rooms', text: 'Create room types and rooms so bookings and occupancy have something to count.' },
    showRestaurant && { href: '/dashboard/restaurant', icon: UtensilsCrossed, title: 'Build your menu and tables', text: 'Add dishes and tables, then print a QR code for each table.' },
    { href: '/dashboard/staff', icon: Users, title: 'Invite your team', text: 'Waiters, kitchen staff and managers each see only what they need.' },
  ].filter(Boolean) as { href: string; icon: typeof Users; title: string; text: string }[];

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="mb-8 flex flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-sub">Today&apos;s operations at a glance</p>
        </div>
        <div className="flex flex-col items-end gap-1 md:flex-row md:items-center md:gap-3 flex-shrink-0">
          <StatusIndicator label={stale ? 'Reconnecting' : 'Live updates'} status={stale ? 'idle' : 'live'} />
          <span className="text-xs md:text-sm text-right text-ink-muted leading-tight">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      {stale && (
        <p role="status" className="mb-6 rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">
          Couldn&apos;t refresh just now. The figures below may be a little out of date, and we&apos;ll keep trying.
        </p>
      )}

      {brandNew && (
        <Card hover={false} className="mb-8">
          <h2 className="text-lg font-semibold text-ink">Set up your property</h2>
          <CardDescription>Nothing to show yet. These three steps get you to your first booking or order.</CardDescription>
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className="group flex h-full flex-col rounded-xl border border-stone-200 p-4 hover:border-amber hover:bg-amber-pale/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                  >
                    <span className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-deep">
                      <Icon className="w-5 h-5" aria-hidden="true" /> Step {i + 1}
                    </span>
                    <span className="font-semibold text-ink">{s.title}</span>
                    <span className="mt-1 text-sm text-ink-muted">{s.text}</span>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-deep">
                      Open <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* Quick stats */}
      <div className={`grid gap-4 md:gap-6 mb-8 grid-cols-1 sm:grid-cols-2 ${statCols}`}>
        {showHotel && (
          <StatCard
            href="/dashboard/rooms"
            tone="amber"
            icon={<Hotel className="w-5 h-5" aria-hidden="true" />}
            value={`${stats.occupancyRate}%`}
            label="Occupancy rate"
            note={`${stats.occupiedRooms} of ${stats.totalRooms} rooms occupied`}
          />
        )}

        {showHotel && (
          <StatCard
            href="/dashboard/bookings"
            tone="sage"
            icon={<Calendar className="w-5 h-5" aria-hidden="true" />}
            value={stats.todayCheckIns}
            label="Check-ins today"
            note={`${stats.todayCheckOuts} check-out${stats.todayCheckOuts === 1 ? '' : 's'} today`}
          />
        )}

        {showRestaurant && (
          <StatCard
            href="/dashboard/orders"
            tone="amber"
            icon={<UtensilsCrossed className="w-5 h-5" aria-hidden="true" />}
            value={stats.activeOrders}
            label="Open orders"
            note={stats.activeOrders > 0
              ? <span className="font-medium text-amber-deep">In progress. View orders</span>
              : 'All caught up'}
          />
        )}

        <StatCard
          tone="stone"
          icon={<IndianRupee className="w-5 h-5" aria-hidden="true" />}
          value={formatCurrency(stats.todayRevenue)}
          label="Collected today"
          note={`${formatCurrency(stats.weekRevenue)} over the last 7 days`}
        />
      </div>

      <div className={`grid gap-4 md:gap-6 mb-8 grid-cols-1 ${panelCols}`}>
        {/* Today's arrivals */}
        {showHotel && (
          <Card hover={false}>
            <CardTitle>Today&apos;s arrivals</CardTitle>
            <CardDescription>Expected check-ins</CardDescription>

            <div className="mt-6 space-y-3">
              {stats.arrivals && stats.arrivals.length > 0 ? (
                stats.arrivals.map((arrival: any, index: number) => (
                  <div key={index} className="flex items-center justify-between gap-3 p-3 bg-cream rounded-xl">
                    <div className="min-w-0">
                      <div className="font-medium text-ink truncate">{arrival.guest?.name || 'Guest'}</div>
                      <div className="text-sm text-ink-muted">
                        Room {arrival.room?.roomNumber} • {arrival.room?.roomType?.name || 'Standard'}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-medium text-ink">
                        {new Date(arrival.checkInDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <Badge variant={arrival.status === 'checked_in' ? 'sage' : 'amber'} className="mt-1">
                        {arrival.status === 'checked_in' ? 'Checked in' : 'Expected'}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-ink-muted">
                  <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" aria-hidden="true" />
                  <p>No arrivals scheduled for today</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Recent orders */}
        {showRestaurant && (
          <Card hover={false}>
            <CardTitle>Recent orders</CardTitle>
            <CardDescription>Restaurant activity in the last 24 hours</CardDescription>

            <div className="mt-6 space-y-3">
              {stats.recentOrders && stats.recentOrders.length > 0 ? (
                stats.recentOrders.map((order: any, index: number) => {
                  const status = orderStatus(order.status);
                  return (
                    <div key={order.id ?? index} className="flex items-center justify-between gap-3 p-3 bg-cream rounded-xl">
                      <div className="min-w-0">
                        <div className="font-medium text-ink">
                          {order.tableId ? `Table ${order.table?.tableNumber}` : `Room ${order.room?.roomNumber}`}
                        </div>
                        <div className="text-sm text-ink-muted">
                          {order.type === 'room_service' ? 'Room service' : 'Dine-in'} • {formatCurrency(order.totalAmount)}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant={status.tone} dot>{status.label}</Badge>
                        <div className="text-xs text-ink-muted mt-1">
                          {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-ink-muted">
                  <UtensilsCrossed className="w-12 h-12 mx-auto mb-2 opacity-30" aria-hidden="true" />
                  <p>No orders in the last 24 hours</p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
