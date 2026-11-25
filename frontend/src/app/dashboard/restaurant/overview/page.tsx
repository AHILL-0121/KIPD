'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { UtensilsCrossed, QrCode, ChefHat, Receipt, Package, ArrowRight } from 'lucide-react';
import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { useQuery } from '@/hooks/use-query';
import { useLive } from '@/lib/use-live';
import { useTenantInfo } from '@/contexts/tenant-context';
import { formatCurrency } from '@/lib/currency';
import { orderStatus } from '@/lib/order-status';

interface OrderRow {
  id: string;
  outletId: string;
  tableId: string | null;
  type: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  table?: { tableNumber: string } | null;
}

interface TableRow {
  id: string;
  outletId: string;
  tableNumber: string;
  capacity: number;
}

export default function RestaurantOverviewPage() {
  const { info } = useTenantInfo();
  const outlets = useMemo(() => info?.outlets ?? [], [info?.outlets]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('all');

  useEffect(() => {
    if (outlets.length === 1) {
      setSelectedOutletId(outlets[0].id);
    }
  }, [outlets]);

  const qs = selectedOutletId !== 'all' ? `?outletId=${selectedOutletId}` : '';
  const { data: orders, isLoading, refetch: refetchOrders } = useQuery<OrderRow[]>(`/api/orders${qs}`, [selectedOutletId]);
  const { data: tables, refetch: refetchTables } = useQuery<TableRow[]>(`/api/tables${qs}`, [selectedOutletId]);

  const refreshAll = () => {
    refetchOrders();
    refetchTables();
  };

  useLive(refreshAll, selectedOutletId !== 'all' ? selectedOutletId : info?.id ?? null);

  if (isLoading && !orders) {
    return <LoadingState message="Loading restaurant overview..." />;
  }

  const orderList = Array.isArray(orders) ? orders : [];
  const tableList = Array.isArray(tables) ? tables : [];
  const openOrders = orderList.filter((o) => !['closed', 'cancelled'].includes(o.status));
  const occupiedTableIds = new Set(openOrders.map((o) => o.tableId).filter(Boolean));
  const takeawayCount = openOrders.filter((o) => o.type === 'take_away').length;
  const kitchenQueue = openOrders.filter((o) => ['new', 'acknowledged', 'preparing'].includes(o.status)).length;
  const readyOrders = openOrders.filter((o) => o.status === 'ready').length;
  const kdsHref =
    selectedOutletId !== 'all'
      ? `/dashboard/kds/${selectedOutletId}`
      : outlets[0]?.id
        ? `/dashboard/kds/${outlets[0].id}`
        : '/dashboard/kds';

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="section-title">Restaurant Overview</h1>
          <p className="section-sub">Floor occupancy, live kitchen queue, and open tabs</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {outlets.length > 1 && (
            <select
              aria-label="Filter overview by outlet"
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm text-ink"
            >
              <option value="all">All Outlets ({outlets.length})</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <Link
            href="/dashboard/orders"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-stone-200 text-sm font-medium text-ink hover:border-amber min-h-[44px]"
          >
            <QrCode className="w-4 h-4 text-amber-deep" aria-hidden="true" />
            Orders
          </Link>
          <Link
            href={kdsHref}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-stone-200 text-sm font-medium text-ink hover:border-amber min-h-[44px]"
          >
            <ChefHat className="w-4 h-4 text-sage-deep" aria-hidden="true" />
            Kitchen Display
          </Link>
          <Link
            href="/dashboard/billing/restaurant"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber text-white text-sm font-medium hover:bg-amber-deep min-h-[44px]"
          >
            <Receipt className="w-4 h-4" aria-hidden="true" />
            Food Billing
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-8">
        <Card hover={false}>
          <CardIcon variant="amber">
            <UtensilsCrossed className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">
            {occupiedTableIds.size}/{tableList.length}
          </div>
          <div className="text-sm font-medium text-ink-soft">Tables Occupied</div>
          <div className="text-xs text-ink-muted mt-1">{Math.max(0, tableList.length - occupiedTableIds.size)} available now</div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="terra">
            <ChefHat className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{kitchenQueue}</div>
          <div className="text-sm font-medium text-ink-soft">In Kitchen Queue</div>
          <div className="text-xs text-ink-muted mt-1">{readyOrders} ready to serve</div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="sage">
            <QrCode className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{openOrders.length}</div>
          <div className="text-sm font-medium text-ink-soft">Active Orders</div>
          <div className="text-xs text-ink-muted mt-1">Running tabs and open tickets</div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="stone">
            <Package className="w-5 h-5" aria-hidden="true" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{takeawayCount}</div>
          <div className="text-sm font-medium text-ink-soft">Open Take-Aways</div>
          <div className="text-xs text-ink-muted mt-1">Counter and parcel orders</div>
        </Card>
      </div>

      <Card hover={false}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <CardTitle>Live Service Queue</CardTitle>
            <CardDescription>Most recent active orders across the selected outlet</CardDescription>
          </div>
          <Link href="/dashboard/orders" className="text-sm font-medium text-amber-deep hover:underline inline-flex items-center gap-1">
            Open POS <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        {openOrders.length === 0 ? (
          <p className="text-sm text-ink-muted py-8 text-center">No active orders right now.</p>
        ) : (
          <div className="space-y-3">
            {openOrders.slice(0, 8).map((o) => {
              const badge = orderStatus(o.status);
              return (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-xl bg-cream border border-stone-200">
                  <div>
                    <div className="font-medium text-ink">
                      {o.table?.tableNumber ? `Table ${o.table.tableNumber}` : o.type.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-ink">{formatCurrency(Number(o.totalAmount || 0))}</span>
                    <Badge variant={badge.tone}>{badge.label}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
