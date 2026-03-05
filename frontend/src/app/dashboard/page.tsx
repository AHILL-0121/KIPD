'use client';

import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { 
  Hotel, 
  Calendar, 
  UtensilsCrossed, 
  IndianRupee,
  TrendingUp,
  Clock
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/currency';

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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    occupancyRate: 0,
    totalRooms: 0,
    occupiedRooms: 0,
    todayCheckIns: 0,
    todayCheckOuts: 0,
    activeOrders: 0,
    todayRevenue: 0,
    weekRevenue: 0,
    arrivals: [],
    recentOrders: [],
    hasProperties: false,
  });
  const [tenantType, setTenantType] = useState<TenantType>('both');
  const [error, setError] = useState<string | null>(null);

  const showHotel = tenantType === 'hotel' || tenantType === 'both';
  const showRestaurant = tenantType === 'restaurant' || tenantType === 'both';

  useEffect(() => {
    // Fetch tenant type
    fetch('/api/tenant/info')
      .then(res => res.json())
      .then(data => { if (data.type) setTenantType(data.type); })
      .catch(console.error);

    // Fetch dashboard stats
    fetch('/api/dashboard/stats')
      .then(res => {
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('NO_TENANT');
          }
          throw new Error('Failed to fetch stats');
        }
        return res.json();
      })
      .then(data => setStats(data))
      .catch(err => {
        console.error(err);
        if (err.message === 'NO_TENANT') {
          setError('NO_TENANT');
        }
      });
  }, []);

  if (error === 'NO_TENANT') {
    return (
      <div className="p-8">
        <Card className="p-12 text-center">
          <Hotel className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
          <h2 className="text-2xl font-display font-bold text-ink mb-2">No Tenant Assigned</h2>
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

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-sub">Today&apos;s operations at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusIndicator label="Live Updates" status="live" />
          <span className="text-sm text-ink-muted">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className={`grid gap-6 mb-8 ${showHotel && showRestaurant ? 'grid-cols-4' : showHotel ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {showHotel && (
          <Card hover={false} className="border-2 border-amber">
            <CardIcon variant="amber">
              <Hotel className="w-5 h-5" />
            </CardIcon>
            <div className="text-3xl font-bold text-ink mb-1">{stats.occupancyRate}%</div>
            <div className="text-sm text-ink-muted">Occupancy Rate</div>
            <div className="text-xs text-ink-muted mt-1">
              {stats.occupiedRooms} / {stats.totalRooms} rooms
            </div>
          </Card>
        )}

        {showHotel && (
          <Card hover={false} className="border-2 border-sage">
            <CardIcon variant="sage">
              <Calendar className="w-5 h-5" />
            </CardIcon>
            <div className="text-3xl font-bold text-ink mb-1">{stats.todayCheckIns}</div>
            <div className="text-sm text-ink-muted">Check-ins Today</div>
            <div className="text-xs text-ink-muted mt-1">
              {stats.todayCheckOuts} check-outs
            </div>
          </Card>
        )}

        {showRestaurant && (
          <Card hover={false} className="border-2 border-terra">
            <CardIcon variant="terra">
              <UtensilsCrossed className="w-5 h-5" />
            </CardIcon>
            <div className="text-3xl font-bold text-ink mb-1">{stats.activeOrders}</div>
            <div className="text-sm text-ink-muted">Active Orders</div>
            <Badge variant="terra" dot className="mt-2">Processing</Badge>
          </Card>
        )}

        <Card hover={false} className="border-2 border-stone-300">
          <CardIcon variant="stone">
            <IndianRupee className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{formatCurrency(stats.todayRevenue)}</div>
          <div className="text-sm text-ink-muted">Today&apos;s Revenue</div>
          <div className="flex items-center gap-1 text-xs text-sage mt-1">
            <TrendingUp className="w-3 h-3" />
            <span>{formatCurrency(stats.weekRevenue)} this week</span>
          </div>
        </Card>
      </div>

      <div className={`grid gap-6 mb-8 ${showHotel && showRestaurant ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {/* Today's Arrivals */}
        {showHotel && (
        <Card hover={false}>
          <CardTitle>Today&apos;s Arrivals</CardTitle>
          <CardDescription>Expected check-ins</CardDescription>
          
          <div className="mt-6 space-y-3">
            {stats.arrivals && stats.arrivals.length > 0 ? (
              stats.arrivals.map((arrival: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-cream rounded-xl">
                  <div>
                    <div className="font-medium text-ink">{arrival.guest?.name || 'Guest'}</div>
                    <div className="text-sm text-ink-muted">
                      Room {arrival.room?.roomNumber} • {arrival.room?.roomType?.name || 'Standard'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-ink">
                      {new Date(arrival.checkInDate).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    <Badge variant="amber" className="mt-1">
                      {arrival.status === 'checked_in' ? 'Checked In' : 'Expected'}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-ink-muted">
                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>No arrivals scheduled for today</p>
              </div>
            )}
          </div>
        </Card>
        )}

        {/* Recent Orders */}
        {showRestaurant && (
        <Card hover={false}>
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>Latest restaurant activity</CardDescription>
          
          <div className="mt-6 space-y-3">
            {stats.recentOrders && stats.recentOrders.length > 0 ? (
              stats.recentOrders.map((order: any, index: number) => {
                const statusVariant = 
                  order.status === 'new' ? 'amber' :
                  order.status === 'preparing' ? 'terra' : 'sage';
                const statusLabel =
                  order.status === 'new' ? 'New' :
                  order.status === 'preparing' ? 'Preparing' : 'Ready';
                
                return (
                  <div key={index} className="flex items-center justify-between p-3 bg-cream rounded-xl">
                    <div>
                      <div className="font-medium text-ink">
                        {order.tableId ? `Table ${order.table?.tableNumber}` : `Room ${order.room?.roomNumber}`}
                      </div>
                      <div className="text-sm text-ink-muted">
                        {order.type === 'room_service' ? 'Room Service' : 'Dine-in'} • {formatCurrency(order.totalAmount)}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={statusVariant as any} dot>{statusLabel}</Badge>
                      <div className="text-xs text-ink-muted mt-1">
                        {Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)} min ago
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-ink-muted">
                <UtensilsCrossed className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>No recent orders</p>
              </div>
            )}
          </div>
        </Card>
        )}
      </div>
    </div>
  );
}
