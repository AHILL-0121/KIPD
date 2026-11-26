'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { confirmDialog } from '@/components/ui/confirm';
import { Plus, Power, Trash2, ChevronLeft, ChevronRight, UserCheck, LayoutGrid, List, RotateCcw, ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: 'hotel' | 'restaurant' | 'both';
  ownerEmail: string;
  plan: string;
  status: 'active' | 'suspended' | 'pending';
  deletedAt?: string | null;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  adminClerkId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  tenantName?: string | null;
  createdAt: string;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTenants, setTotalTenants] = useState(0);
  const pageSize = 12;
  const [showNewModal, setShowNewModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    ownerEmail: '',
    type: 'both' as 'hotel' | 'restaurant' | 'both',
    plan: 'basic' as 'basic' | 'pro' | 'enterprise',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const [impTarget, setImpTarget] = useState<Tenant | null>(null);
  const [impReason, setImpReason] = useState('');
  const [impStarting, setImpStarting] = useState(false);

  const fetchTenants = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (planFilter !== 'all') qs.set('plan', planFilter);

      const res = await fetch(`/api/admin/tenants?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch tenants');
      const data = await res.json();
      if (Array.isArray(data)) {
        setTenants(data);
        setTotalTenants(data.length);
        setTotalPages(1);
      } else {
        setTenants(Array.isArray(data.items) ? data.items : []);
        setTotalTenants(Number(data.total ?? 0));
        setTotalPages(Number(data.totalPages ?? 1));
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setTenants([]);
    }
  }, [page, search, statusFilter, planFilter]);

  const fetchAudit = useCallback(() => {
    fetch('/api/admin/audit')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAuditLogs(Array.isArray(data) ? data : []))
      .catch(() => setAuditLogs([]));
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const action = tenant.deletedAt ? 'activate' : tenant.status === 'active' ? 'suspend' : 'activate';
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast(
        tenant.deletedAt
          ? `Restored tenant "${tenant.name}"`
          : `Tenant "${tenant.name}" ${action === 'suspend' ? 'suspended' : 'activated'}`,
        'success',
      );
      fetchTenants();
      fetchAudit();
    } catch {
      showToast('Failed to update tenant status', 'error');
    }
  };

  const handlePlanChange = async (tenant: Tenant, plan: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast(`Updated ${tenant.name} to ${plan} plan`, 'success');
      fetchTenants();
      fetchAudit();
    } catch {
      showToast('Failed to update plan', 'error');
    }
  };

  const handleCreateTenant = async () => {
    if (!formData.name || !formData.slug || !formData.ownerEmail) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create tenant');
      }

      const result = await response.json();
      await fetchTenants();
      fetchAudit();

      setFormData({ name: '', slug: '', ownerEmail: '', type: 'both', plan: 'basic' });
      setShowNewModal(false);

      if (result.message) {
        setInviteMessage(result.message);
      } else {
        showToast(result.warning || 'Tenant created successfully', 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create tenant. Please try again.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const confirmImpersonate = async () => {
    if (!impTarget) return;
    setImpStarting(true);
    try {
      const res = await fetch(`/api/admin/impersonate/${impTarget.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: impReason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to impersonate');
      window.location.href = data.redirectUrl || '/dashboard';
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start impersonation', 'error');
      setImpStarting(false);
    }
  };

  const handleDeleteTenant = async (tenantId: string, tenantName: string) => {
    if (
      !(await confirmDialog({
        title: `Delete "${tenantName}"?`,
        message: 'Everyone in this business loses access straight away. Its records are kept and can be restored from Archived.',
        confirmLabel: 'Delete tenant',
        danger: true,
      }))
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete tenant');

      await fetchTenants();
      fetchAudit();
      showToast(`Tenant "${tenantName}" moved to archive`, 'success');
    } catch {
      showToast('Failed to delete tenant. Please try again.', 'error');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="section-title">Tenants</h1>
          <p className="section-sub">Manage all properties ({totalTenants})</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-stone-200/70 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Card view"
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-label="Table view"
              className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={() => setShowNewModal(true)}>
            <Plus className="w-4 h-4" />
            Create Tenant
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex-1 min-w-[220px]">
          <Input
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-md"
          />
        </div>

        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All Status' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'pending', label: 'Pending' },
            { value: 'deleted', label: 'Archived (Deleted)' },
          ]}
        />

        <Select
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All Plans' },
            { value: 'basic', label: 'Basic' },
            { value: 'pro', label: 'Pro' },
            { value: 'enterprise', label: 'Enterprise' },
          ]}
        />
      </div>

      {/* Tenants Grid / Table */}
      {viewMode === 'table' ? (
        <Card hover={false} className="overflow-x-auto p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-stone-50 border-b border-stone-200 text-xs uppercase text-ink-muted">
              <tr>
                <th className="py-3 px-4">Property</th>
                <th className="py-3 px-4">Owner</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-stone-50/70">
                  <td className="py-3 px-4">
                    <Link href={`/admin/tenants/${tenant.id}`} className="font-semibold text-ink hover:text-amber">
                      {tenant.name}
                    </Link>
                    <div className="text-xs text-ink-muted">/{tenant.slug}</div>
                  </td>
                  <td className="py-3 px-4 text-ink-soft">{tenant.ownerEmail}</td>
                  <td className="py-3 px-4 capitalize">{tenant.type}</td>
                  <td className="py-3 px-4">
                    <select
                      aria-label={`Plan for ${tenant.name}`}
                      value={tenant.plan || 'basic'}
                      onChange={(e) => handlePlanChange(tenant, e.target.value)}
                      className="text-xs font-medium capitalize border border-stone-200 rounded-lg px-2 py-1 bg-cream text-ink"
                    >
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={tenant.deletedAt ? 'terra' : tenant.status === 'active' ? 'sage' : 'stone'} dot>
                      {tenant.deletedAt ? 'archived' : tenant.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {!tenant.deletedAt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setImpTarget(tenant);
                            setImpReason('');
                          }}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Impersonate
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(tenant)}>
                        {tenant.deletedAt ? <RotateCcw className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        {tenant.deletedAt ? 'Restore' : tenant.status === 'active' ? 'Suspend' : 'Activate'}
                      </Button>
                      {!tenant.deletedAt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {tenants.map((tenant) => (
            <Card key={tenant.id} className="relative flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/tenants/${tenant.id}`}
                      className="inline-flex items-center gap-1 font-semibold text-ink text-lg hover:text-amber transition-colors"
                    >
                      <span className="truncate">{tenant.name}</span>
                      <ArrowUpRight className="w-4 h-4 flex-shrink-0" />
                    </Link>
                    <p className="text-sm text-ink-muted truncate">/{tenant.slug}</p>
                  </div>

                  <Badge
                    variant={
                      tenant.deletedAt
                        ? 'terra'
                        : tenant.status === 'active'
                          ? 'sage'
                          : tenant.status === 'suspended'
                            ? 'stone'
                            : 'amber'
                    }
                    dot
                  >
                    {tenant.deletedAt ? 'archived' : tenant.status}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between gap-2">
                    <span className="text-ink-muted">Type</span>
                    <span className="text-ink capitalize">{tenant.type || 'both'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-ink-muted">Owner</span>
                    <span className="text-ink truncate">{tenant.ownerEmail}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-ink-muted">Plan</span>
                    <select
                      aria-label={`Plan for ${tenant.name}`}
                      value={tenant.plan || 'basic'}
                      onChange={(e) => handlePlanChange(tenant, e.target.value)}
                      className="text-xs font-medium capitalize border border-stone-200 rounded-lg px-2 py-1 bg-cream text-ink"
                    >
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-ink-muted">Created</span>
                    <span className="text-ink">{new Date(tenant.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-4 border-t border-stone-200">
                {!tenant.deletedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 min-w-[110px] px-2.5"
                    onClick={() => {
                      setImpTarget(tenant);
                      setImpReason('');
                    }}
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span className="truncate">Impersonate</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 min-w-[96px] px-2.5"
                  onClick={() => handleToggleStatus(tenant)}
                >
                  {tenant.deletedAt ? <RotateCcw className="w-4 h-4 shrink-0" /> : <Power className="w-4 h-4 shrink-0" />}
                  <span>{tenant.deletedAt ? 'Restore' : tenant.status === 'active' ? 'Suspend' : 'Activate'}</span>
                </Button>
                {!tenant.deletedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                    aria-label={`Delete ${tenant.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tenants.length === 0 && (
        <div className="text-center py-16">
          <p className="text-ink-muted">No tenants found</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-stone-200 pt-4 text-sm text-ink-muted">
          <span>
            Showing page {page} of {totalPages} ({totalTenants} total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {auditLogs.length > 0 && (
        <Card hover={false} className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-ink">Recent Platform Audit Log</h2>
            <Link href="/admin/audit" className="text-sm font-medium text-amber hover:underline">
              Full audit log →
            </Link>
          </div>
          <div className="divide-y divide-stone-100 text-sm">
            {auditLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs bg-stone-100 px-2 py-0.5 rounded text-ink mr-2">{log.action}</span>
                  <span className="text-ink-muted">
                    {log.tenantName || (log.targetId ? `${log.targetType} · ${log.targetId.slice(0, 8)}` : log.targetType)}
                  </span>
                </div>
                <span className="text-xs text-ink-muted">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Create Modal */}
      <Dialog
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        labelledBy="create-tenant-title"
        dismissible={!isCreating}
        className="p-6 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <h2 id="create-tenant-title" className="font-serif text-2xl font-bold mb-6">
          Create New Tenant
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-2">Business Type</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'hotel', label: 'Hotel', icon: '🏨', desc: 'Rooms & Bookings' },
                { value: 'restaurant', label: 'Restaurant', icon: '🍽️', desc: 'Menu & Orders' },
                { value: 'both', label: 'Both', icon: '🏢', desc: 'Full Service' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: opt.value as 'hotel' | 'restaurant' | 'both' })}
                  className={`p-3 sm:p-4 rounded-xl border-2 text-center transition-all ${
                    formData.type === opt.value
                      ? 'border-amber bg-amber-50'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{opt.icon}</div>
                  <div className="font-medium text-ink text-sm">{opt.label}</div>
                  <div className="text-xs text-ink-muted">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Business Name"
            placeholder="Grand Palace Hotel"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            label="URL Slug"
            placeholder="grand-palace"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
          />
          <Input
            label="Owner Email"
            type="email"
            placeholder="owner@hotel.com"
            value={formData.ownerEmail}
            onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
          />
          <Select
            label="Initial Plan"
            value={formData.plan}
            onChange={(e) => setFormData({ ...formData, plan: e.target.value as 'basic' | 'pro' | 'enterprise' })}
            options={[
              { value: 'basic', label: 'Basic' },
              { value: 'pro', label: 'Pro' },
              { value: 'enterprise', label: 'Enterprise' },
            ]}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="text-blue-900">
              An invitation email will be sent to the owner so they can set their own password and access their dashboard.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="ghost" className="flex-1" onClick={() => setShowNewModal(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button variant="terra" className="flex-1" onClick={handleCreateTenant} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create & Invite'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Impersonation Guardrail Dialog */}
      <Dialog
        open={Boolean(impTarget)}
        onClose={() => !impStarting && setImpTarget(null)}
        labelledBy="impersonate-title"
        dismissible={!impStarting}
        className="p-6 max-w-md w-full"
      >
        {impTarget && (
          <div className="space-y-4">
            <h2 id="impersonate-title" className="text-xl font-bold text-ink">
              Impersonate {impTarget.name}
            </h2>
            {impTarget.status !== 'active' && (
              <div className="p-3 rounded-xl bg-amber-pale border border-amber text-sm text-amber-deep">
                This tenant is currently <strong>{impTarget.status}</strong>. Impersonating allows support inspection;
                tenant users remain blocked until activated.
              </div>
            )}
            <p className="text-sm text-ink-muted">
              A 30-minute signed support session will start and be recorded in the Platform Audit Log.
            </p>
            <Input
              label="Support reason (optional)"
              placeholder="e.g. Troubleshooting invoice layout or onboarding"
              value={impReason}
              onChange={(e) => setImpReason(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setImpTarget(null)} disabled={impStarting}>
                Cancel
              </Button>
              <Button onClick={confirmImpersonate} disabled={impStarting}>
                {impStarting ? 'Starting...' : 'Start Impersonation'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Invitation Success Dialog */}
      <Dialog
        open={Boolean(inviteMessage)}
        onClose={() => setInviteMessage(null)}
        labelledBy="invite-sent-title"
        className="p-8 max-w-md w-full"
      >
        <div className="text-center mb-6">
          <h2 id="invite-sent-title" className="font-serif text-2xl font-bold text-ink mb-2">
            Invitation Sent!
          </h2>
          <p className="text-ink-muted">{inviteMessage}</p>
        </div>

        <Button
          variant="terra"
          className="w-full mt-2"
          onClick={() => {
            setInviteMessage(null);
            showToast('Tenant created successfully', 'success');
          }}
        >
          Done
        </Button>
      </Dialog>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-8 right-8 z-50 px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
              toast.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-900'
                : 'bg-red-50 border border-red-200 text-red-900'
            }`}
          >
            <span className="font-medium">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
              className="ml-2 text-gray-500 hover:text-gray-700"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
