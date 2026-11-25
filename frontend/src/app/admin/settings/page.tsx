'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wrench, Save, ExternalLink } from 'lucide-react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function AdminSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState(
    'Kipd is currently undergoing scheduled maintenance. Normal operations will resume shortly.',
  );
  const [estimatedEnd, setEstimatedEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetch('/api/admin/maintenance')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        setEnabled(Boolean(data.enabled));
        if (data.message) setMessage(data.message);
        setEstimatedEnd(data.estimatedEnd || '');
      })
      .catch(() => {
        setNotice({ text: 'Failed to load platform settings', type: 'error' });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (nextEnabled = enabled) => {
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

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="section-title">Platform Settings</h1>
        <p className="section-sub">Global controls for all tenants and public pages</p>
      </div>

      {notice && (
        <div
          role="status"
          className={`mb-6 rounded-xl px-4 py-3 text-sm border ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      <Card hover={false}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber rounded-lg flex items-center justify-center text-white">
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
            <div className="flex items-center justify-between p-4 rounded-xl bg-cream border border-stone-200">
              <div>
                <div className="font-medium text-ink">Enable Maintenance Mode</div>
                <div className="text-xs text-ink-muted">
                  Health checks (/api/health), webhooks, and /admin stay online.
                </div>
              </div>
              <Button
                type="button"
                variant={enabled ? 'terra' : 'primary'}
                disabled={saving}
                onClick={() => handleSave(!enabled)}
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
              <Link
                href="/maintenance"
                target="_blank"
                className="inline-flex items-center gap-1.5 text-sm text-amber-deep hover:underline font-medium"
              >
                Preview /maintenance
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>

              <Button type="button" onClick={() => handleSave(enabled)} disabled={saving}>
                <Save className="w-4 h-4" aria-hidden="true" />
                Save Message
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
