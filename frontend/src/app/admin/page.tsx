'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusIndicator } from '@/components/ui/status-indicator';
import {
  Building2,
  Users,
  Activity,
  IndianRupee,
  DollarSign,
  AlertTriangle,
  Inbox,
  ArrowRight,
  Database,
  ShieldCheck,
} from 'lucide-react';

interface AdminStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  mrr: number;
  currency?: 'INR' | 'USD';
  totalUsers?: number;
  planCounts?: { basic: number; pro: number; enterprise: number };
  pendingAccessRequests?: number;
  gmv30d?: number;
}

interface AnalyticsData {
  gmv: { allTimeNet: number; stay30d: number; restaurant30d: number; total30d: number };
  activity30d: { bookingsCreated: number; ordersCreated: number; billsSettled: number };
  stalledTenants: Array<{ id: string; name: string; slug: string; ownerEmail: string; createdAt: string }>;
  recentActivity: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string | null;
    tenantName?: string | null;
    createdAt: string;
  }>;
}

interface HealthData {
  checkedAt: string;
  database: { ok: boolean; latencyMs: number; migrationsCount: number | null };
  clerk: { ok: boolean; latencyMs: number };
  maintenance: { enabled: boolean };
  integrations: Record<string, boolean>;
}

function formatMoney(amount: number, currency: 'INR' | 'USD' = 'USD') {
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>({
    totalTenants: 0,
    activeTenants: 0,
    suspendedTenants: 0,
    mrr: 0,
    currency: 'USD',
    totalUsers: 0,
    pendingAccessRequests: 0,
    gmv30d: 0,
  });
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats?detailed=1')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(console.error);

    fetch('/api/admin/analytics')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAnalytics(data);
      })
      .catch(console.error);

    fetch('/api/admin/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setHealth(data);
      })
      .catch(console.error);
  }, []);

  const currency = stats.currency ?? 'USD';
  const RevenueIcon = currency === 'INR' ? IndianRupee : DollarSign;
  const isHealthy = health ? health.database.ok && health.clerk.ok && !health.maintenance.enabled : true;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="section-title">Platform Overview</h1>
          <p className="section-sub">Monitor and manage all tenants, onboarding, and system health</p>
        </div>

        {(stats.pendingAccessRequests ?? 0) > 0 && (
          <Link
            href="/admin/requests"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber text-white text-sm font-medium hover:bg-amber-deep transition-colors"
          >
            <Inbox className="w-4 h-4" />
            <span>{stats.pendingAccessRequests} Pending Request{stats.pendingAccessRequests === 1 ? '' : 's'}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <StatusIndicator
        label={
          health?.maintenance.enabled
            ? 'Maintenance Mode Active'
            : isHealthy
              ? 'Platform Operational'
              : 'Degraded Service Detected'
        }
        status={isHealthy ? 'live' : 'idle'}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card hover={false}>
          <CardIcon variant="amber">
            <Building2 className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{stats.totalTenants}</div>
          <div className="text-sm font-medium text-ink">Total Tenants</div>
          <div className="text-xs text-ink-muted mt-1">
            {stats.planCounts
              ? `${stats.planCounts.basic} Basic · ${stats.planCounts.pro} Pro · ${stats.planCounts.enterprise} Ent.`
              : `${stats.suspendedTenants} suspended`}
          </div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="sage">
            <Activity className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{stats.activeTenants}</div>
          <div className="text-sm font-medium text-ink">Active Tenants</div>
          <div className="text-xs text-ink-muted mt-1">{stats.suspendedTenants} suspended</div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="terra">
            <Users className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{stats.totalUsers ?? 0}</div>
          <div className="text-sm font-medium text-ink">Total Users</div>
          <div className="text-xs text-ink-muted mt-1">Across Clerk directory</div>
        </Card>

        <Card hover={false}>
          <CardIcon variant="stone">
            <RevenueIcon className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{formatMoney(stats.mrr ?? 0, currency)}</div>
          <div className="text-sm font-medium text-ink">Estimated MRR</div>
          <div className="text-xs text-ink-muted mt-1">
            30d Tenant GMV: ₹{(analytics?.gmv.total30d ?? stats.gmv30d ?? 0).toLocaleString('en-IN')}
          </div>
        </Card>
      </div>

      {/* Platform GMV & Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card hover={false}>
          <CardTitle>Cross-Tenant GMV (30d)</CardTitle>
          <CardDescription>Net collected across all active properties</CardDescription>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Hotel Stays (30d)</span>
              <span className="font-semibold text-ink">
                ₹{(analytics?.gmv.stay30d ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Restaurant F&amp;B (30d)</span>
              <span className="font-semibold text-ink">
                ₹{(analytics?.gmv.restaurant30d ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="pt-2 border-t border-stone-200 flex justify-between">
              <span className="text-ink-muted">All-Time Net Collected</span>
              <span className="font-bold text-ink">
                ₹{(analytics?.gmv.allTimeNet ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </Card>

        <Card hover={false}>
          <CardTitle>30-Day Platform Volume</CardTitle>
          <CardDescription>Operational throughput across tenants</CardDescription>
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl bg-cream">
              <div className="text-2xl font-bold text-ink">{analytics?.activity30d.bookingsCreated ?? 0}</div>
              <div className="text-xs text-ink-muted mt-0.5">Bookings</div>
            </div>
            <div className="p-3 rounded-xl bg-cream">
              <div className="text-2xl font-bold text-ink">{analytics?.activity30d.ordersCreated ?? 0}</div>
              <div className="text-xs text-ink-muted mt-0.5">Orders</div>
            </div>
            <div className="p-3 rounded-xl bg-cream">
              <div className="text-2xl font-bold text-ink">{analytics?.activity30d.billsSettled ?? 0}</div>
              <div className="text-xs text-ink-muted mt-0.5">Bills Paid</div>
            </div>
          </div>
        </Card>

        <Card hover={false}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Stalled Onboarding</CardTitle>
              <CardDescription>Tenants &gt;7 days with 0 rooms, menu &amp; orders</CardDescription>
            </div>
            {(analytics?.stalledTenants.length ?? 0) > 0 && (
              <Badge variant="amber">{analytics?.stalledTenants.length}</Badge>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {!analytics || analytics.stalledTenants.length === 0 ? (
              <p className="text-sm text-ink-muted py-3">All active tenants are configured.</p>
            ) : (
              analytics.stalledTenants.slice(0, 4).map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/tenants/${t.id}`}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 hover:border-amber text-sm transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-ink truncate">{t.name}</div>
                    <div className="text-xs text-ink-muted truncate">{t.ownerEmail}</div>
                  </div>
                  <AlertTriangle className="w-4 h-4 text-amber flex-shrink-0" />
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Recent Activity & System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card hover={false}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest platform events and admin actions</CardDescription>
            </div>
            <Link href="/admin/audit" className="text-sm font-medium text-amber hover:underline">
              View audit log →
            </Link>
          </div>

          <div className="mt-5 space-y-2.5">
            {!analytics || analytics.recentActivity.length === 0 ? (
              <div className="py-6 text-center text-ink-muted text-sm">No audit activity recorded yet</div>
            ) : (
              analytics.recentActivity.slice(0, 6).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-stone-100 last:border-0 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-stone-100 text-ink mr-2">
                      {entry.action}
                    </span>
                    <span className="text-ink-soft truncate">
                      {entry.tenantName || (entry.targetId ? `${entry.targetType} · ${entry.targetId.slice(0, 8)}` : entry.targetType)}
                    </span>
                  </div>
                  <span className="text-xs text-ink-muted whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card hover={false}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>System Health</CardTitle>
              <CardDescription>Live infrastructure &amp; integration checks</CardDescription>
            </div>
            <Link href="/admin/system" className="text-sm font-medium text-amber hover:underline">
              Diagnostics →
            </Link>
          </div>

          {!health ? (
            <div className="mt-6 py-6 text-center text-ink-muted text-sm">Checking services...</div>
          ) : (
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 rounded-xl bg-cream">
                <span className="flex items-center gap-2 font-medium text-ink">
                  <Database className="w-4 h-4 text-ink-muted" />
                  PostgreSQL (Neon)
                  {health.database.migrationsCount !== null && (
                    <span className="text-xs text-ink-muted">({health.database.migrationsCount} migrations)</span>
                  )}
                </span>
                <Badge variant={health.database.ok ? 'sage' : 'terra'} dot>
                  {health.database.ok ? `OK · ${health.database.latencyMs}ms` : 'Error'}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-cream">
                <span className="flex items-center gap-2 font-medium text-ink">
                  <ShieldCheck className="w-4 h-4 text-ink-muted" />
                  Clerk Auth API
                </span>
                <Badge variant={health.clerk.ok ? 'sage' : 'terra'} dot>
                  {health.clerk.ok ? `OK · ${health.clerk.latencyMs}ms` : 'Unreachable'}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(health.integrations).map(([key, configured]) => (
                  <Badge key={key} variant={configured ? 'sage' : 'stone'}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}: {configured ? 'On' : 'Off'}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
