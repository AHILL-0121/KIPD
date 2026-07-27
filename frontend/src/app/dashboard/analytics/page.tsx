'use client';

import { useState, useEffect } from 'react';
import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
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
import { TrendingUp, Users, DollarSign, Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('week');
  const [stats, setStats] = useState<any>({
    revenue: 0,
    occupancy: 0,
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
        // Keep empty defaults
        setStats({
          revenue: 0,
          occupancy: 0,
          guests: 0,
          avgOrderValue: 0,
          occupancyData: [],
          revenueData: [],
          categoryBreakdown: [],
          topItems: []
        });
      });
  }, [timeRange]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Analytics & Reports</h1>
          <p className="section-sub">Performance insights and trends</p>
        </div>
        
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
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card hover={false}>
          <CardIcon variant="amber">
            <DollarSign className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{formatCurrency(stats.revenue || 0)}</div>
          <div className="text-sm text-ink-muted">Total Revenue</div>
          {stats.revenueChange && (
            <div className="flex items-center gap-1 text-xs text-sage mt-2">
              <TrendingUp className="w-3 h-3" />
              <span>{stats.revenueChange}</span>
            </div>
          )}
        </Card>

        <Card hover={false}>
          <CardIcon variant="sage">
            <Calendar className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{stats.occupancy || 0}%</div>
          <div className="text-sm text-ink-muted">Avg Occupancy</div>
          {stats.occupancyNote && (
            <div className="text-xs text-ink-muted mt-2">{stats.occupancyNote}</div>
          )}
        </Card>

        <Card hover={false}>
          <CardIcon variant="terra">
            <Users className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{stats.guests || 0}</div>
          <div className="text-sm text-ink-muted">Total Guests</div>
          {stats.newGuests && (
            <div className="text-xs text-ink-muted mt-2">{stats.newGuests} new guests</div>
          )}
        </Card>

        <Card hover={false}>
          <CardIcon variant="stone">
            <BarChart className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{formatCurrency(stats.avgOrderValue || 0)}</div>
          <div className="text-sm text-ink-muted">Avg Order Value</div>
          <div className="text-xs text-ink-muted mt-2">F&B per guest</div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-8">
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
                  <Line type="monotone" dataKey="rate" stroke="#E8A020" strokeWidth={3} />
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
          <CardTitle>Revenue Breakdown</CardTitle>
          <CardDescription>Rooms vs F&B daily revenue</CardDescription>
          
          <div className="mt-6 h-64">
            {stats.revenueData?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                  <XAxis dataKey="date" stroke="#A8A29E" />
                  <YAxis stroke="#A8A29E" />
                  <Tooltip />
                  <Bar dataKey="rooms" fill="#E8A020" />
                  <Bar dataKey="food" fill="#C8573A" />
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
      <div className="grid grid-cols-2 gap-6">
        <Card hover={false}>
          <CardTitle>Revenue by Category</CardTitle>
          <CardDescription>Distribution of income sources</CardDescription>
          
          <div className="mt-6 h-64 flex items-center">
            {stats.categoryBreakdown?.length > 0 ? (
              <>
                <ResponsiveContainer width="50%" height="100%">
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
                
                <div className="flex-1 space-y-3">
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
          <CardDescription>Best sellers this week</CardDescription>
          
          <div className="mt-6">
            {stats.topItems?.length > 0 ? (
              <div className="space-y-3">
                {stats.topItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-stone-100">
                    <div>
                      <div className="text-sm font-medium text-ink">{item.name}</div>
                      <div className="text-xs text-ink-muted">{item.orders} orders</div>
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
    </div>
  );
}
