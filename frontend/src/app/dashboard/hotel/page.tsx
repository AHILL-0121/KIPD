'use client';

import Link from 'next/link';
import { Hotel, Calendar, Receipt, BedDouble, Sparkles, Wrench, ArrowRight } from 'lucide-react';
import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { useQuery } from '@/hooks/use-query';
import { useLive } from '@/lib/use-live';
import { useTenantInfo } from '@/contexts/tenant-context';
import { useAppMessages } from '@/components/ui/i18n-provider';
import { formatCurrency } from '@/lib/currency';

interface RoomRow {
  id: string;
  roomNumber: string;
  status: string;
  floor: number;
  roomType?: { name: string };
}

interface BookingRow {
  id: string;
  status: string;
  source?: string;
  checkInDate: string;
  checkOutDate: string;
  totalAmount: string;
  guest?: { name: string };
  room?: { roomNumber: string };
}

interface DashboardStats {
  occupancyRate: number;
  totalRooms: number;
  occupiedRooms: number;
  todayCheckIns: number;
  todayCheckOuts: number;
}

export default function HotelOverviewPage() {
  const m = useAppMessages();
  const { info } = useTenantInfo();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DashboardStats>('/api/dashboard/stats');
  const { data: rooms, refetch: refetchRooms } = useQuery<RoomRow[]>('/api/rooms');
  const { data: bookings, refetch: refetchBookings } = useQuery<BookingRow[]>('/api/bookings');

  const refreshAll = () => {
    refetchStats();
    refetchRooms();
    refetchBookings();
  };

  useLive(refreshAll, info?.id ?? null);

  if (statsLoading && !stats) {
    return <LoadingState message={m.common.loading} />;
  }

  const roomList = Array.isArray(rooms) ? rooms : [];
  const bookingList = Array.isArray(bookings) ? bookings : [];

  const availableRooms = roomList.filter((r) => r.status === 'available').length;
  const cleaningRooms = roomList.filter((r) => r.status === 'dirty' || r.status === 'cleaning').length;
  const maintenanceRooms = roomList.filter((r) => r.status === 'maintenance' || r.status === 'blocked').length;
  const pendingRequests = bookingList.filter((b) => b.status === 'pending');
  const checkedInBookings = bookingList.filter((b) => b.status === 'checked_in');

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="section-title">{m.dashboard.hotelOverview}</h1>
          <p className="section-sub">Room readiness, front-desk arrivals, and stay billing</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/rooms"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-stone-200 text-sm font-medium text-ink hover:border-amber min-h-[44px]"
          >
            <Hotel className="w-4 h-4 text-amber-deep" aria-hidden="true" />
            {m.nav.rooms}
          </Link>
          <Link
            href="/dashboard/bookings"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-stone-200 text-sm font-medium text-ink hover:border-amber min-h-[44px]"
          >
            <Calendar className="w-4 h-4 text-sage-deep" aria-hidden="true" />
            {m.nav.bookings}
          </Link>
          <Link
            href="/dashboard/billing/hotel"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber text-white text-sm font-medium hover:bg-amber-deep min-h-[44px]"
          >
            <Receipt className="w-4 h-4" aria-hidden="true" />
            {m.billing.hotelTitle}
          </Link>
        </div>
      </div>

      {/* Room KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-8">
        <Card hover={false}>
          <CardIcon variant="amber">
            <BedDouble className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{stats?.occupancyRate ?? 0}%</div>
          <div className="text-sm font-medium text-ink-soft">{m.dashboard.occupancyRate}</div>
          <div className="text-xs text-ink-muted mt-1">
            {stats?.occupiedRooms ?? 0} {m.dashboard.of} {roomList.length || stats?.totalRooms || 0} {m.dashboard.roomsOccupiedSuffix}
          </div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="sage">
            <Hotel className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{availableRooms}</div>
          <div className="text-sm font-medium text-ink-soft">Ready for Check-In</div>
          <div className="text-xs text-ink-muted mt-1">{checkedInBookings.length} active stays right now</div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="stone">
            <Sparkles className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{cleaningRooms}</div>
          <div className="text-sm font-medium text-ink-soft">Housekeeping Queue</div>
          <div className="text-xs text-ink-muted mt-1">Dirty or currently being cleaned</div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="terra">
            <Wrench className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{maintenanceRooms}</div>
          <div className="text-sm font-medium text-ink-soft">Out of Service</div>
          <div className="text-xs text-ink-muted mt-1">Maintenance or blocked rooms</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card hover={false}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle>Pending Booking Requests</CardTitle>
              <CardDescription>Online requests waiting for front-desk confirmation</CardDescription>
            </div>
            <Link href="/dashboard/bookings" className="text-sm font-medium text-amber-deep hover:underline inline-flex items-center gap-1">
              Review all <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          {pendingRequests.length === 0 ? (
            <p className="text-sm text-ink-muted py-6 text-center">No pending booking requests.</p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.slice(0, 6).map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-cream border border-stone-200">
                  <div>
                    <div className="font-medium text-ink">{b.guest?.name || 'Guest'}</div>
                    <div className="text-xs text-ink-muted">
                      {m.rooms.roomPrefix} {b.room?.roomNumber || '-'} · {new Date(b.checkInDate).toLocaleDateString()} →{' '}
                      {new Date(b.checkOutDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-ink">{formatCurrency(Number(b.totalAmount || 0))}</div>
                    <Badge variant="amber">{m.bookings.pending}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card hover={false}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle>In-House Guests</CardTitle>
              <CardDescription>Currently checked-in stays ({stats?.todayCheckOuts ?? 0} check-outs due today)</CardDescription>
            </div>
            <Link href="/dashboard/billing/hotel" className="text-sm font-medium text-amber-deep hover:underline inline-flex items-center gap-1">
              View folios <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          {checkedInBookings.length === 0 ? (
            <p className="text-sm text-ink-muted py-6 text-center">No checked-in guests at the moment.</p>
          ) : (
            <div className="space-y-3">
              {checkedInBookings.slice(0, 6).map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-cream border border-stone-200">
                  <div>
                    <div className="font-medium text-ink">{b.guest?.name || 'Guest'}</div>
                    <div className="text-xs text-ink-muted">
                      {m.rooms.roomPrefix} {b.room?.roomNumber || '-'} · {m.bookings.checkedOut} {new Date(b.checkOutDate).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant="sage" dot>{m.bookings.checkedIn}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
