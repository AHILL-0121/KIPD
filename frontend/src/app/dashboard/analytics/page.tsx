'use client';

import { useState, useEffect } from 'react';
import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useTenantInfo } from '@/contexts/tenant-context';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  TrendingUp,
  Users,
  DollarSign,
  Calendar,
  Download,
  Hotel,
  UtensilsCrossed,
  ReceiptText
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

export default function AnalyticsPage() {
  const { info } = useTenantInfo();
  const tenantType = info?.type || 'both';

  const [timeRange, setTimeRange] = useState('week');
  const [stats, setStats] = useState<any>({
    revenue: 0,
    roomRevenue: 0,
    totalCombinedRevenue: 0,
    occupancy: 0,
    hotelOccupancy: 0,
    adr: 0,
    revPar: 0,
    guests: 0,
    avgOrderValue: 0,
    occupancyData: [],
    revenueData: [],
    categoryBreakdown: [],
    topItems: []
  });

  useEffect(() => {
    fetch(`/api/analytics?range=${timeRange}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => setStats(data))
      .catch(() => {
        setStats({
          revenue: 0,
          roomRevenue: 0,
          totalCombinedRevenue: 0,
          occupancy: 0,
          hotelOccupancy: 0,
          adr: 0,
          revPar: 0,
          guests: 0,
          avgOrderValue: 0,
          occupancyData: [],
          revenueData: [],
          categoryBreakdown: [],
          topItems: []
        });
      });
  }, [timeRange]);

  const handleExport = (type: 'sales' | 'gst') => {
    const url = `/api/analytics/export?type=${type}&range=${timeRange}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `kipd-${type}-report-${timeRange}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const showHotel = tenantType === 'hotel' || tenantType === 'both';
  const showRestaurant = tenantType === 'restaurant' || tenantType === 'both';

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="section-title">Analytics & Reports</h1>
          <p className="section-sub">Performance insights, financial reports, and exports</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            options={[
              { value: 'day', label: 'Today' },
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
              { value: 'year', label: 'This Year' },
            ]}
          />

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleExport('sales')}
              className="bg-stone-100 hover:bg-stone-200 text-xs gap-1.5 h-10 px-3"
              title="Download detailed item sales CSV"
            >
              <Download className="w-4 h-4 text-amber" />
              <span>Export Sales</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleExport('gst')}
              className="bg-stone-100 hover:bg-stone-200 text-xs gap-1.5 h-10 px-3"
              title="Download GST / Tax invoice report CSV"
            >
              <ReceiptText className="w-4 h-4 text-emerald-700" />
              <span>Export Tax / GST</span>
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards — F&B & Combined */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card hover={false}>
          <CardIcon variant="amber">
            <DollarSign className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">
            {formatCurrency(showHotel && showRestaurant ? (stats.totalCombinedRevenue || 0) : (stats.revenue || 0))}
          </div>
          <div className="text-sm text-ink-muted">
            {showHotel && showRestaurant ? 'Total Gross Revenue' : 'F&B Revenue'}
          </div>
          {stats.revenueChange && (
            <div className="flex items-center gap-1 text-xs text-sage mt-2">
              <TrendingUp className="w-3 h-3" />
              <span>{stats.revenueChange}</span>
            </div>
          )}
        </Card>

        {showRestaurant && (
          <Card hover={false}>
            <CardIcon variant="sage">
              <Calendar className="w-5 h-5" />
            </CardIcon>
            <div className="text-3xl font-bold text-ink mb-1">{stats.occupancy || 0}%</div>
            <div className="text-sm text-ink-muted">Table Occupancy</div>
            {stats.occupancyNote && (
              <div className="text-xs text-ink-muted mt-2">{stats.occupancyNote}</div>
            )}
          </Card>
        )}

        {showRestaurant && (
          <Card hover={false}>
            <CardIcon variant="terra">
              <Users className="w-5 h-5" />
            </CardIcon>
            <div className="text-3xl font-bold text-ink mb-1">{stats.guests || 0}</div>
            <div className="text-sm text-ink-muted">Total F&B Orders</div>
            <div className="text-xs text-ink-muted mt-2">Kitchen tickets placed</div>
          </Card>
        )}

        {showRestaurant && (
          <Card hover={false}>
            <CardIcon variant="stone">
              <UtensilsCrossed className="w-5 h-5" />
            </CardIcon>
            <div className="text-3xl font-bold text-ink mb-1">{formatCurrency(stats.avgOrderValue || 0)}</div>
            <div className="text-sm text-ink-muted">Avg Order Value</div>
            <div className="text-xs text-ink-muted mt-2">F&B per order</div>
          </Card>
        )}
      </div>

      {/* Hotel Operations KPIs (when applicable) */}
      {showHotel && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Hotel className="w-5 h-5 text-amber" />
            <h2 className="text-lg font-bold text-ink">Hotel Accommodation Metrics</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card hover={false}>
              <CardIcon variant="amber">
                <Hotel className="w-5 h-5" />
              </CardIcon>
              <div className="text-2xl font-bold text-ink mb-1">{formatCurrency(stats.roomRevenue || 0)}</div>
              <div className="text-sm text-ink-muted">Room Revenue</div>
              <div className="text-xs text-ink-muted mt-2">From confirmed stays</div>
            </Card>

            <Card hover={false}>
              <CardIcon variant="sage">
                <Calendar className="w-5 h-5" />
              </CardIcon>
              <div className="text-2xl font-bold text-ink mb-1">{stats.hotelOccupancy || 0}%</div>
              <div className="text-sm text-ink-muted">Room Occupancy</div>
              <div className="text-xs text-ink-muted mt-2">{stats.hotelOccupancyNote}</div>
            </Card>

            <Card hover={false}>
              <CardIcon variant="terra">
                <TrendingUp className="w-5 h-5" />
              </CardIcon>
              <div className="text-2xl font-bold text-ink mb-1">{formatCurrency(stats.adr || 0)}</div>
              <div className="text-sm text-ink-muted">Average Daily Rate (ADR)</div>
              <div className="text-xs text-ink-muted mt-2">Revenue per booked room</div>
            </Card>

            <Card hover={false}>
              <CardIcon variant="stone">
                <DollarSign className="w-5 h-5" />
              </CardIcon>
              <div className="text-2xl font-bold text-ink mb-1">{formatCurrency(stats.revPar || 0)}</div>
              <div className="text-sm text-ink-muted">RevPAR</div>
              <div className="text-xs text-ink-muted mt-2">Revenue per available room</div>
            </Card>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card hover={false}>
          <CardTitle>Occupancy Trend</CardTitle>
          <CardDescription>Daily occupancy rate (%)</CardDescription>

          <div className="mt-6 h-64">
            {stats.occupancyData?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.occupancyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                  <XAxis dataKey="date" stroke="#A8A29E" />
                  <YAxis stroke="#A8A29E" />
                  <Tooltip />
                  <Line type="monotone" dataKey="rate" stroke="#0B6B6F" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-ink-muted text-sm">
                No occupancy data available
              </div>
            )}
          </div>
        </Card>

        <Card hover={false}>
          <CardTitle>Revenue Trend</CardTitle>
          <CardDescription>Daily revenue distribution</CardDescription>

          <div className="mt-6 h-64">
            {stats.revenueData?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                  <XAxis dataKey="date" stroke="#A8A29E" />
                  <YAxis stroke="#A8A29E" />
                  <Tooltip />
                  <Bar dataKey="food" name="Revenue (₹)" fill="#d97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-ink-muted text-sm">
                No revenue data available
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Additional Insights */}
      {showRestaurant && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card hover={false}>
            <CardTitle>Revenue by Category</CardTitle>
            <CardDescription>Distribution of F&B income sources</CardDescription>

            <div className="mt-6 h-auto sm:h-64 flex flex-col sm:flex-row items-center gap-6 sm:gap-0">
              {stats.categoryBreakdown?.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={250} className="sm:w-1/2 sm:h-full">
                    <PieChart>
                      <Pie
                        data={stats.categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        dataKey="value"
                      >
                        {stats.categoryBreakdown.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="flex-1 w-full space-y-3">
                    {stats.categoryBreakdown.map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-sm text-ink">{item.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-ink">{formatCurrency(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center w-full text-ink-muted text-sm">
                  No category data available
                </div>
              )}
            </div>
          </Card>

          <Card hover={false}>
            <CardTitle>Top Menu Items</CardTitle>
            <CardDescription>Best sellers in selected period</CardDescription>

            <div className="mt-6">
              {stats.topItems?.length > 0 ? (
                <div className="space-y-3">
                  {stats.topItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-stone-100">
                      <div>
                        <div className="text-sm font-medium text-ink">{item.name}</div>
                        <div className="text-xs text-ink-muted">{item.orders} sold</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-amber">{formatCurrency(item.revenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-ink-muted text-sm">
                  No top items data available
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
