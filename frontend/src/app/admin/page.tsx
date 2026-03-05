'use client';

import { Card, CardIcon, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { Building2, Users, Activity, DollarSign } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalTenants: 0,
    activeTenants: 0,
    totalUsers: 0,
    platformRevenue: 0,
  });

  useEffect(() => {
    // Fetch platform stats
    fetch('/api/admin/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(console.error);
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="section-title">Platform Overview</h1>
        <p className="section-sub">Monitor and manage all tenants</p>
      </div>

      <StatusIndicator label="Platform Operational" status="live" className="mb-8" />

      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card hover={false} className="border-2 border-amber">
          <CardIcon variant="amber">
            <Building2 className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{stats.totalTenants}</div>
          <div className="text-sm text-ink-muted">Total Tenants</div>
        </Card>

        <Card hover={false} className="border-2 border-sage">
          <CardIcon variant="sage">
            <Activity className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{stats.activeTenants}</div>
          <div className="text-sm text-ink-muted">Active Now</div>
        </Card>

        <Card hover={false} className="border-2 border-terra">
          <CardIcon variant="terra">
            <Users className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">{stats.totalUsers}</div>
          <div className="text-sm text-ink-muted">Total Users</div>
        </Card>

        <Card hover={false} className="border-2 border-stone-300">
          <CardIcon variant="stone">
            <DollarSign className="w-5 h-5" />
          </CardIcon>
          <div className="text-3xl font-bold text-ink mb-1">${stats.platformRevenue}</div>
          <div className="text-sm text-ink-muted">Monthly Revenue</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card hover={false}>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest platform events and actions</CardDescription>
          
          <div className="mt-6 text-center py-8 text-ink-muted text-sm">
            No recent activity
          </div>
        </Card>

        <Card hover={false}>
          <CardTitle>System Health</CardTitle>
          <CardDescription>Monitoring and performance metrics</CardDescription>
          
          <div className="mt-6 text-center py-8 text-ink-muted text-sm">
            System health monitoring coming soon
          </div>
        </Card>
      </div>
    </div>
  );
}
