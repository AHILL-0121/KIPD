'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wrench, Save, ExternalLink, Megaphone, Sliders } from 'lucide-react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import type { PlanPricingConfig, PlatformAnnouncement } from '@/lib/platform-config';

export default function AdminSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState(
    'Kipd is currently undergoing scheduled maintenance. Normal operations will resume shortly.',
  );
  const [estimatedEnd, setEstimatedEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [announcement, setAnnouncement] = useState<PlatformAnnouncement>({
    enabled: false,
    message: '',
    tone: 'info',
    linkUrl: null,
    linkLabel: null,
  });

  const [planConfig, setPlanConfig] = useState<PlanPricingConfig | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/maintenance').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/admin/settings').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([mData, sData]) => {
        if (mData) {
          setEnabled(Boolean(mData.enabled));
          if (mData.message) setMessage(mData.message);
          setEstimatedEnd(mData.estimatedEnd || '');
        }
        if (sData) {
          if (sData.announcement) setAnnouncement(sData.announcement);
          if (sData.plans) setPlanConfig(sData.plans);
        }
      })
      .catch(() => {
        setNotice({ text: 'Failed to load platform settings', type: 'error' });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveMaintenance = async (nextEnabled = enabled) => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: nextEnabled,
          message: message.trim(),
          estimatedEnd: estimatedEnd.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setEnabled(Boolean(data.enabled));
      setMessage(data.message);
      setEstimatedEnd(data.estimatedEnd || '');
      setNotice({
        text: data.enabled ? 'Maintenance mode enabled. Visitors now see /maintenance.' : 'Maintenance mode disabled. Platform is live.',
        type: 'success',
      });
    } catch {
      setNotice({ text: 'Could not update maintenance settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async (payload: { announcement?: PlatformAnnouncement; plans?: PlanPricingConfig }, okText: string) => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.announcement) setAnnouncement(data.announcement);
      if (data.plans) setPlanConfig(data.plans);
      setNotice({ text: okText, type: 'success' });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const updateTierField = (tier: 'basic' | 'pro' | 'enterprise', key: 'monthlyPrice' | 'rooms' | 'tables' | 'outlets' | 'staff', val: string) => {
    if (!planConfig) return;
    setPlanConfig((prev) => {
      if (!prev) return prev;
      const copy = structuredClone(prev);
      if (key === 'monthlyPrice') {
        copy.plans[tier].monthlyPrice = Math.max(0, Number(val) || 0);
      } else {
        copy.plans[tier].quotas[key] = val.trim() === '' ? null : Math.max(0, Math.floor(Number(val) || 0));
      }
      return copy;
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="section-title">Platform Settings</h1>
        <p className="section-sub">Global controls, soft announcements, and plan pricing across all tenants</p>
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm border ${
            notice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Maintenance Mode */}
      <Card hover={false}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber rounded-lg flex items-center justify-center text-white shrink-0">
              <Wrench className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Maintenance Mode</CardTitle>
              <CardDescription>
                Temporarily route tenant dashboards, guest booking, and QR menus to /maintenance while keeping Platform Admin accessible.
              </CardDescription>
            </div>
          </div>

          <Badge variant={enabled ? 'amber' : 'sage'} dot>
            {enabled ? 'Maintenance Active' : 'Operational'}
          </Badge>
        </div>

        {loading ? (
          <p className="text-sm text-ink-muted py-4">Loading settings...</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-cream border border-stone-200">
              <div>
                <div className="font-medium text-ink">Enable Maintenance Mode</div>
                <div className="text-xs text-ink-muted">Health checks (/api/health), webhooks, and /admin stay online.</div>
              </div>
              <Button
                type="button"
                variant={enabled ? 'terra' : 'primary'}
                disabled={saving}
                onClick={() => handleSaveMaintenance(!enabled)}
              >
                {enabled ? 'Disable Maintenance' : 'Enable Maintenance'}
              </Button>
            </div>

            <div className="space-y-2">
              <label htmlFor="maintenance-msg" className="text-sm font-medium text-ink">
                Visitor Notice Message
              </label>
              <textarea
                id="maintenance-msg"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-amber"
                placeholder="Explain what is happening..."
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="maintenance-eta" className="text-sm font-medium text-ink">
                Expected Return (optional)
              </label>
              <Input
                id="maintenance-eta"
                value={estimatedEnd}
                onChange={(e) => setEstimatedEnd(e.target.value)}
                placeholder="e.g. Today at 03:30 AM IST"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Link href="/maintenance" target="_blank" className="inline-flex items-center gap-1.5 text-sm text-amber-deep hover:underline font-medium">
                Preview /maintenance
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>

              <Button type="button" onClick={() => handleSaveMaintenance(enabled)} disabled={saving}>
                <Save className="w-4 h-4" aria-hidden="true" />
                Save Message
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Global Soft Announcement Banner */}
      <Card hover={false}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-stone-800 rounded-lg flex items-center justify-center text-white shrink-0">
              <Megaphone className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Dashboard Announcement Banner</CardTitle>
              <CardDescription>
                Display a dismissible soft notice inside every tenant&apos;s staff dashboard without blocking operations.
              </CardDescription>
            </div>
          </div>
          <Badge variant={announcement.enabled ? 'amber' : 'stone'}>
            {announcement.enabled ? 'Visible to Tenants' : 'Hidden'}
          </Badge>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={announcement.enabled}
                onChange={(e) => setAnnouncement((a) => ({ ...a, enabled: e.target.checked }))}
                className="rounded border-stone-300"
              />
              Show announcement banner in staff dashboards
            </label>

            <div className="w-44">
              <Select
                label="Banner Tone"
                value={announcement.tone}
                onChange={(e) => setAnnouncement((a) => ({ ...a, tone: e.target.value as 'info' | 'warning' }))}
                options={[
                  { value: 'info', label: 'Info (Neutral Teal)' },
                  { value: 'warning', label: 'Warning (Amber)' },
                ]}
              />
            </div>
          </div>

          <Input
            label="Announcement Message"
            placeholder="e.g. Scheduled 10-minute upgrade tonight at 02:00 AM IST — zero downtime expected."
            value={announcement.message}
            onChange={(e) => setAnnouncement((a) => ({ ...a, message: e.target.value }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Optional Link Label"
              placeholder="Release notes"
              value={announcement.linkLabel || ''}
              onChange={(e) => setAnnouncement((a) => ({ ...a, linkLabel: e.target.value || null }))}
            />
            <Input
              label="Optional Link URL"
              placeholder="https://..."
              value={announcement.linkUrl || ''}
              onChange={(e) => setAnnouncement((a) => ({ ...a, linkUrl: e.target.value || null }))}
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={saving}
              onClick={() => handleSaveConfig({ announcement }, 'Dashboard announcement saved')}
            >
              <Save className="w-4 h-4" />
              Save Announcement
            </Button>
          </div>
        </div>
      </Card>

      {/* Plan Pricing & Quotas */}
      {planConfig && (
        <Card hover={false}>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sage rounded-lg flex items-center justify-center text-white shrink-0">
                <Sliders className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Plan Pricing &amp; Resource Quotas</CardTitle>
                <CardDescription>
                  Controls enforced quotas across tenants and MRR calculations on Platform Overview (leave quota blank for Unlimited).
                </CardDescription>
              </div>
            </div>

            <div className="w-36">
              <Select
                label="MRR Currency"
                value={planConfig.currency}
                onChange={(e) => setPlanConfig((p) => (p ? { ...p, currency: e.target.value as 'INR' | 'USD' } : p))}
                options={[
                  { value: 'USD', label: 'USD ($)' },
                  { value: 'INR', label: 'INR (₹)' },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['basic', 'pro', 'enterprise'] as const).map((tier) => {
              const cfg = planConfig.plans[tier];
              return (
                <div key={tier} className="p-4 rounded-xl bg-cream border border-stone-200 space-y-3">
                  <div className="font-bold text-ink capitalize">{tier}</div>
                  <Input
                    label={`Monthly (${planConfig.currency})`}
                    type="number"
                    min={0}
                    value={String(cfg.monthlyPrice)}
                    onChange={(e) => updateTierField(tier, 'monthlyPrice', e.target.value)}
                  />
                  <Input
                    label="Rooms Limit"
                    type="number"
                    placeholder="Unlimited"
                    value={cfg.quotas.rooms === null ? '' : String(cfg.quotas.rooms)}
                    onChange={(e) => updateTierField(tier, 'rooms', e.target.value)}
                  />
                  <Input
                    label="Tables Limit"
                    type="number"
                    placeholder="Unlimited"
                    value={cfg.quotas.tables === null ? '' : String(cfg.quotas.tables)}
                    onChange={(e) => updateTierField(tier, 'tables', e.target.value)}
                  />
                  <Input
                    label="Outlets Limit"
                    type="number"
                    placeholder="Unlimited"
                    value={cfg.quotas.outlets === null ? '' : String(cfg.quotas.outlets)}
                    onChange={(e) => updateTierField(tier, 'outlets', e.target.value)}
                  />
                  <Input
                    label="Staff + Invites Limit"
                    type="number"
                    placeholder="Unlimited"
                    value={cfg.quotas.staff === null ? '' : String(cfg.quotas.staff)}
                    onChange={(e) => updateTierField(tier, 'staff', e.target.value)}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4">
            <Button
              type="button"
              disabled={saving}
              onClick={() => handleSaveConfig({ plans: planConfig }, 'Plan pricing and quotas saved')}
            >
              <Save className="w-4 h-4" />
              Save Plan Config
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
