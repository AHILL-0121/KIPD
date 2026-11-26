'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface PaymentEventItem {
  id: string;
  tenantId: string;
  tenantName: string;
  source: string;
  sourceApp: string | null;
  parsedAmount: string | null;
  parsedReference: string | null;
  matchedBillId: string | null;
  matchConfidence: string | null;
  rawPayload: string;
  createdAt: string;
}

interface HealthData {
  checkedAt: string;
  database: { ok: boolean; latencyMs: number; migrationsCount: number | null };
  clerk: { ok: boolean; latencyMs: number };
  maintenance: { enabled: boolean };
  integrations: Record<string, boolean>;
}

export default function AdminSystemPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [events, setEvents] = useState<PaymentEventItem[]>([]);
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [hRes, sRes] = await Promise.all([fetch('/api/admin/health'), fetch('/api/admin/system')]);
      if (hRes.ok) setHealth(await hRes.json());
      if (sRes.ok) {
        const sData = await sRes.json();
        setEvents(Array.isArray(sData.paymentEvents) ? sData.paymentEvents : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const visibleEvents = onlyAnomalies
    ? events.filter((e) => e.matchConfidence !== 'exact' || !e.matchedBillId)
    : events;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="section-title">System &amp; Webhook Diagnostics</h1>
          <p className="section-sub">Service readiness, database migrations, and payment webhook anomalies</p>
        </div>
        <Button variant="ghost" onClick={loadAll} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Re-check
        </Button>
      </div>

      {health && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card hover={false}>
            <CardTitle>Core Infrastructure</CardTitle>
            <CardDescription>Checked {new Date(health.checkedAt).toLocaleTimeString('en-IN')}</CardDescription>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between p-3 rounded-xl bg-cream">
                <span>PostgreSQL (Neon)</span>
                <Badge variant={health.database.ok ? 'sage' : 'terra'}>
                  {health.database.ok ? `OK (${health.database.latencyMs}ms)` : 'Down'}
                </Badge>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-cream">
                <span>Applied Drizzle Migrations</span>
                <Badge variant="stone">{health.database.migrationsCount ?? 'Unknown'}</Badge>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-cream">
                <span>Clerk Backend API</span>
                <Badge variant={health.clerk.ok ? 'sage' : 'terra'}>
                  {health.clerk.ok ? `OK (${health.clerk.latencyMs}ms)` : 'Unavailable'}
                </Badge>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-cream">
                <span>Maintenance Gate</span>
                <Badge variant={health.maintenance.enabled ? 'amber' : 'sage'}>
                  {health.maintenance.enabled ? 'Active' : 'Operational'}
                </Badge>
              </div>
            </div>
          </Card>

          <Card hover={false}>
            <CardTitle>Configured Integrations</CardTitle>
            <CardDescription>Environment capability flags (secrets stay on server)</CardDescription>
            <div className="mt-4 grid grid-cols-2 gap-2.5 text-sm">
              {Object.entries(health.integrations).map(([key, enabled]) => (
                <div key={key} className="flex items-center justify-between p-2.5 rounded-xl bg-cream">
                  <span className="truncate pr-2 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <Badge variant={enabled ? 'sage' : 'stone'}>{enabled ? 'Ready' : 'Unset'}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card hover={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <CardTitle>Payment Webhook Events ({visibleEvents.length})</CardTitle>
            <CardDescription>Logged Razorpay &amp; payment events stored for reconciliation and anomaly review</CardDescription>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAnomalies}
              onChange={(e) => setOnlyAnomalies(e.target.checked)}
              className="rounded border-stone-300"
            />
            Show unmatched / anomalies only
          </label>
        </div>

        {visibleEvents.length === 0 ? (
          <p className="text-sm text-ink-muted py-6 text-center">No matching payment events recorded.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {visibleEvents.map((ev) => {
              const isExpanded = expandedId === ev.id;
              return (
                <div key={ev.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={ev.matchConfidence === 'exact' ? 'sage' : 'amber'}>
                        {ev.matchConfidence || 'logged'}
                      </Badge>
                      <Link href={`/admin/tenants/${ev.tenantId}`} className="font-semibold text-ink hover:text-amber">
                        {ev.tenantName}
                      </Link>
                      <span className="text-ink-muted">
                        {ev.parsedAmount ? `₹${ev.parsedAmount}` : '—'}
                        {ev.parsedReference ? ` · Ref ${ev.parsedReference}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted">
                        {new Date(ev.createdAt).toLocaleString('en-IN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                        className="p-1 rounded hover:bg-stone-100 text-ink-muted"
                        aria-label="Inspect payload"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <pre className="mt-2 p-3 rounded-xl bg-stone-900 text-stone-100 text-xs overflow-x-auto">
                      {ev.rawPayload}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
