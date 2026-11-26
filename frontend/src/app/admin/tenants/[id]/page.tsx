'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ArrowLeft, Mail, Save, UserCheck } from 'lucide-react';

interface TenantDetailPayload {
  tenant: {
    id: string;
    name: string;
    slug: string;
    type: 'hotel' | 'restaurant' | 'both';
    ownerEmail: string;
    plan: string;
    status: string;
    timezone: string;
    deletedAt: string | null;
    createdAt: string;
  };
  usage: { rooms: number; tables: number; outlets: number; staff: number };
  limits: { rooms: number | null; tables: number | null; outlets: number | null; staff: number | null };
  properties: Array<{ id: string; name: string; email: string | null }>;
  outlets: Array<{ id: string; name: string; slug: string; type: string; isActive: boolean }>;
  metrics: {
    staffCount: number;
    bookingsCount: number;
    lastBookingAt: string | null;
    ordersCount: number;
    lastOrderAt: string | null;
    totalCollected: number;
    openBillsCount: number;
  };
  ownerClerkStatus: 'linked' | 'pending_invite' | 'unlinked';
  recentAudit: Array<{ id: string; action: string; adminClerkId: string; createdAt: string }>;
}

export default function AdminTenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<TenantDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    name: '',
    type: 'both' as 'hotel' | 'restaurant' | 'both',
    ownerEmail: '',
    timezone: 'Asia/Kolkata',
    plan: 'basic',
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      if (!res.ok) throw new Error('Failed');
      const payload = (await res.json()) as TenantDetailPayload;
      setData(payload);
      setForm({
        name: payload.tenant.name,
        type: payload.tenant.type,
        ownerEmail: payload.tenant.ownerEmail,
        timezone: payload.tenant.timezone,
        plan: payload.tenant.plan,
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update tenant');
      setNotice({ text: 'Tenant details updated', type: 'success' });
      void load();
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Update failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleResendInvite = async () => {
    if (!id) return;
    setResending(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/resend-invite`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send invite');
      setNotice({ text: json.message || 'Owner invite processed', type: 'success' });
      void load();
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Invite failed', type: 'error' });
    } finally {
      setResending(false);
    }
  };

  const handleImpersonate = async () => {
    if (!id) return;
    const res = await fetch(`/api/admin/impersonate/${id}`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) window.location.href = json.redirectUrl || '/dashboard';
  };

  if (loading) return <div className="p-8 text-sm text-ink-muted">Loading tenant profile...</div>;
  if (!data) {
    return (
      <div className="p-8 space-y-4">
        <Link href="/admin/tenants" className="inline-flex items-center gap-2 text-sm text-amber hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Tenants
        </Link>
        <Card hover={false} className="p-8 text-center text-ink-muted">
          Tenant not found.
        </Card>
      </div>
    );
  }

  const quotaRows: Array<{ label: string; used: number; limit: number | null }> = [
    { label: 'Rooms', used: data.usage.rooms, limit: data.limits.rooms },
    { label: 'Tables', used: data.usage.tables, limit: data.limits.tables },
    { label: 'Outlets', used: data.usage.outlets, limit: data.limits.outlets },
    { label: 'Staff + Invites', used: data.usage.staff, limit: data.limits.staff },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <Link href="/admin/tenants" className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="w-4 h-4" />
        Back to Tenants
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="section-title">{data.tenant.name}</h1>
            <Badge variant={data.tenant.deletedAt ? 'terra' : data.tenant.status === 'active' ? 'sage' : 'stone'} dot>
              {data.tenant.deletedAt ? 'archived' : data.tenant.status}
            </Badge>
          </div>
          <p className="section-sub">/{data.tenant.slug} · ID {data.tenant.id}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={handleResendInvite} disabled={resending}>
            <Mail className="w-4 h-4" />
            {resending ? 'Sending...' : 'Resend Owner Invite'}
          </Button>
          {!data.tenant.deletedAt && (
            <Button onClick={handleImpersonate}>
              <UserCheck className="w-4 h-4" />
              Impersonate
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm border ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Quota Usage & Operational Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card hover={false}>
          <CardTitle>Plan Quota Usage ({data.tenant.plan.toUpperCase()})</CardTitle>
          <CardDescription>Live footprint vs subscription limits</CardDescription>
          <div className="mt-4 space-y-3">
            {quotaRows.map((row) => {
              const pct = row.limit ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
              return (
                <div key={row.label} className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">{row.label}</span>
                    <span className="font-semibold text-ink">
                      {row.used} / {row.limit === null ? 'Unlimited' : row.limit}
                    </span>
                  </div>
                  {row.limit !== null && (
                    <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 90 ? 'bg-terra' : 'bg-amber'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card hover={false}>
          <CardTitle>Activity &amp; Billing Snapshot</CardTitle>
          <CardDescription>
            Owner status:{' '}
            <strong className="text-ink capitalize">{data.ownerClerkStatus.replace('_', ' ')}</strong>
          </CardDescription>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-xl bg-cream">
              <div className="text-xs text-ink-muted">Total Bookings</div>
              <div className="text-xl font-bold text-ink">{data.metrics.bookingsCount}</div>
            </div>
            <div className="p-3 rounded-xl bg-cream">
              <div className="text-xs text-ink-muted">Total Orders</div>
              <div className="text-xl font-bold text-ink">{data.metrics.ordersCount}</div>
            </div>
            <div className="p-3 rounded-xl bg-cream">
              <div className="text-xs text-ink-muted">Total Collected</div>
              <div className="text-xl font-bold text-ink">₹{data.metrics.totalCollected.toLocaleString('en-IN')}</div>
            </div>
            <div className="p-3 rounded-xl bg-cream">
              <div className="text-xs text-ink-muted">Unsettled Bills</div>
              <div className="text-xl font-bold text-ink">{data.metrics.openBillsCount}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Edit Tenant Form + Outlets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card hover={false}>
          <CardTitle>Edit Property &amp; Plan</CardTitle>
          <div className="mt-4 space-y-3">
            <Input
              label="Property Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="Owner Email"
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Business Type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'hotel' | 'restaurant' | 'both' }))}
                options={[
                  { value: 'both', label: 'Both' },
                  { value: 'hotel', label: 'Hotel Only' },
                  { value: 'restaurant', label: 'Restaurant Only' },
                ]}
              />
              <Select
                label="Plan"
                value={form.plan}
                onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                options={[
                  { value: 'basic', label: 'Basic' },
                  { value: 'pro', label: 'Pro' },
                  { value: 'enterprise', label: 'Enterprise' },
                ]}
              />
            </div>
            <Input
              label="Timezone (IANA)"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            />
            <div className="pt-2 flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Card>

        <Card hover={false}>
          <CardTitle>Properties &amp; Outlets</CardTitle>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">Properties</div>
              {data.properties.map((p) => (
                <div key={p.id} className="p-2.5 rounded-xl bg-cream mb-2 flex justify-between">
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="text-xs text-ink-muted">{p.email || '—'}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">Outlets</div>
              {data.outlets.length === 0 ? (
                <p className="text-ink-muted">No outlets created.</p>
              ) : (
                data.outlets.map((o) => (
                  <div key={o.id} className="p-2.5 rounded-xl bg-cream mb-2 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-ink">{o.name}</span>
                      <span className="ml-2 text-xs text-ink-muted">/{o.slug}</span>
                    </div>
                    <Badge variant={o.isActive ? 'sage' : 'stone'}>{o.type}</Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
