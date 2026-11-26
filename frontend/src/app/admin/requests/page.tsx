'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Check, X, Search, Inbox } from 'lucide-react';

interface AccessRequestItem {
  id: string;
  name: string;
  email: string;
  company: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  tenantId: string | null;
  createdAt: string;
}

function slugifyCompany(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export default function AdminRequestsPage() {
  const [items, setItems] = useState<AccessRequestItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [approveTarget, setApproveTarget] = useState<AccessRequestItem | null>(null);
  const [approveForm, setApproveForm] = useState({
    name: '',
    slug: '',
    type: 'both' as 'hotel' | 'restaurant' | 'both',
    plan: 'basic' as 'basic' | 'pro' | 'enterprise',
    timezone: 'Asia/Kolkata',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: statusFilter });
      if (search.trim()) qs.set('search', search.trim());
      const res = await fetch(`/api/admin/requests?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const openApprove = (item: AccessRequestItem) => {
    setApproveTarget(item);
    setApproveForm({
      name: item.company,
      slug: slugifyCompany(item.company),
      type: 'both',
      plan: 'basic',
      timezone: 'Asia/Kolkata',
    });
  };

  const handleApprove = async () => {
    if (!approveTarget || !approveForm.slug) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/requests/${approveTarget.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approveForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ text: data.error || 'Failed to provision tenant', type: 'error' });
        return;
      }
      setToast({ text: data.message || data.warning || 'Tenant provisioned & request approved', type: 'success' });
      setApproveTarget(null);
      void fetchRequests();
    } catch {
      setToast({ text: 'Network error approving request', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (item: AccessRequestItem) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/requests/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      if (!res.ok) throw new Error('Failed');
      setToast({ text: `Marked request from ${item.company} as rejected`, type: 'success' });
      void fetchRequests();
    } catch {
      setToast({ text: 'Could not reject request', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="section-title">Access Requests</h1>
        <p className="section-sub">Inbound leads from the public /sign-up form ready for provisioning</p>
      </div>

      {toast && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm border ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-1 bg-stone-200/60 p-1 rounded-xl">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                statusFilter === st ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, company..."
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <Card hover={false} className="p-10 text-center text-sm text-ink-muted">
          Loading access requests...
        </Card>
      ) : items.length === 0 ? (
        <Card hover={false} className="p-12 text-center">
          <Inbox className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-ink">No {statusFilter === 'all' ? '' : statusFilter} requests</h3>
          <p className="text-sm text-ink-muted mt-1">New requests from /sign-up will appear here automatically.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id} hover={false} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-ink">{item.company}</h3>
                    <Badge variant={item.status === 'approved' ? 'sage' : item.status === 'rejected' ? 'terra' : 'amber'}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-soft">
                    {item.name} · <span className="font-mono text-xs">{item.email}</span>
                  </p>
                  {item.message && (
                    <p className="text-sm text-ink-muted pt-1 max-w-2xl whitespace-pre-wrap">{item.message}</p>
                  )}
                  <p className="text-xs text-ink-muted pt-1">
                    Submitted {new Date(item.createdAt).toLocaleString('en-IN')}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.status === 'pending' && (
                    <>
                      <Button size="sm" onClick={() => openApprove(item)} disabled={submitting}>
                        <Check className="w-4 h-4" />
                        Approve &amp; Create Tenant
                      </Button>
                      <Button size="sm" variant="terra" onClick={() => handleReject(item)} disabled={submitting}>
                        <X className="w-4 h-4" />
                        Reject
                      </Button>
                    </>
                  )}
                  {item.tenantId && (
                    <Link
                      href={`/admin/tenants/${item.tenantId}`}
                      className="text-sm font-medium text-amber hover:underline"
                    >
                      Open Tenant →
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(approveTarget)}
        onClose={() => !submitting && setApproveTarget(null)}
        labelledBy="approve-request-title"
        dismissible={!submitting}
        className="p-6 max-w-md w-full"
      >
        {approveTarget && (
          <div className="space-y-4">
            <h2 id="approve-request-title" className="text-xl font-bold text-ink">
              Approve &amp; Provision Tenant
            </h2>
            <p className="text-sm text-ink-muted">
              Creating a property for <strong>{approveTarget.email}</strong> ({approveTarget.name}).
            </p>
            <Input
              label="Property Name"
              value={approveForm.name}
              onChange={(e) => setApproveForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="URL Slug"
              value={approveForm.slug}
              onChange={(e) => setApproveForm((f) => ({ ...f, slug: slugifyCompany(e.target.value) }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Business Type"
                value={approveForm.type}
                onChange={(e) => setApproveForm((f) => ({ ...f, type: e.target.value as 'hotel' | 'restaurant' | 'both' }))}
                options={[
                  { value: 'both', label: 'Hotel & Restaurant' },
                  { value: 'hotel', label: 'Hotel Only' },
                  { value: 'restaurant', label: 'Restaurant Only' },
                ]}
              />
              <Select
                label="Initial Plan"
                value={approveForm.plan}
                onChange={(e) => setApproveForm((f) => ({ ...f, plan: e.target.value as 'basic' | 'pro' | 'enterprise' }))}
                options={[
                  { value: 'basic', label: 'Basic' },
                  { value: 'pro', label: 'Pro' },
                  { value: 'enterprise', label: 'Enterprise' },
                ]}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setApproveTarget(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleApprove} disabled={submitting || !approveForm.name || !approveForm.slug}>
                {submitting ? 'Provisioning...' : 'Provision & Send Invite'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
