'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { confirmDialog } from '@/components/ui/confirm';
import { Plus, Power, Trash2, ChevronLeft, ChevronRight, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: 'hotel' | 'restaurant' | 'both';
  ownerEmail: string;
  plan: string;
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
}

interface AuditEntry {
  id: string;
  adminClerkId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
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
  });
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

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
      .then(res => (res.ok ? res.json() : []))
      .then(data => setAuditLogs(Array.isArray(data) ? data : []))
      .catch(() => setAuditLogs([]));
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const filteredTenants = tenants;

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const action = tenant.status === 'active' ? 'suspend' : 'activate';
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast(`Tenant "${tenant.name}" ${action === 'suspend' ? 'suspended' : 'activated'}`, 'success');
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
      setToast({ message: 'Please fill in all fields', type: 'error' });
      setTimeout(() => setToast(null), 3000);
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
        throw new Error('Failed to create tenant');
      }

      const result = await response.json();
      
      // Refresh the tenants list
      await fetchTenants();
      fetchAudit();
      
      // Reset form and close modal
      setFormData({ name: '', slug: '', ownerEmail: '', type: 'both' });
      setShowNewModal(false);
      
      // Show invitation success banner or fallback toast
      if (result.message) {
        setInviteMessage(result.message);
      } else {
        setToast({ message: result.warning || 'Tenant created successfully', type: 'success' });
        setTimeout(() => setToast(null), 5000);
      }
    } catch (error) {
      console.error('Error creating tenant:', error);
      setToast({ message: 'Failed to create tenant. Please try again.', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsCreating(false);
    }
  };

  const handleImpersonate = async (tenant: Tenant) => {
    try {
      const res = await fetch(`/api/admin/impersonate/${tenant.id}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to impersonate');
      window.location.href = data.redirectUrl || '/dashboard';
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start impersonation', 'error');
    }
  };

  const handleDeleteTenant = async (tenantId: string, tenantName: string) => {
    // The server hides the tenant and blocks access; no data is removed (see DELETE /api/admin/tenants/[id]).
    if (!(await confirmDialog({ title: `Delete "${tenantName}"?`, message: 'Everyone in this business loses access straight away. Its records are kept.', confirmLabel: 'Delete tenant', danger: true }))) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete tenant');
      }

      // Refresh the tenants list
      await fetchTenants();
      fetchAudit();

      setToast({ message: `Tenant "${tenantName}" deleted successfully`, type: 'success' });
      setTimeout(() => setToast(null), 5000);
    } catch (error) {
      console.error('Error deleting tenant:', error);
      setToast({ message: 'Failed to delete tenant. Please try again.', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Tenants</h1>
          <p className="section-sub">Manage all properties</p>
        </div>
        
        <Button onClick={() => setShowNewModal(true)}>
          <Plus className="w-4 h-4" />
          Create Tenant
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[220px]">
          <Input
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="max-w-md"
          />
        </div>
        
        <Select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          options={[
            { value: 'all', label: 'All Status' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'pending', label: 'Pending' },
          ]}
        />

        <Select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          options={[
            { value: 'all', label: 'All Plans' },
            { value: 'basic', label: 'Basic' },
            { value: 'pro', label: 'Pro' },
            { value: 'enterprise', label: 'Enterprise' },
          ]}
        />
      </div>

      {/* Tenants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTenants.map((tenant) => (
          <Card key={tenant.id} className="relative">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-ink text-lg">{tenant.name}</h3>
                <p className="text-sm text-ink-muted">/{tenant.slug}</p>
              </div>
              
              <Badge 
                variant={
                  tenant.status === 'active' ? 'sage' : 
                  tenant.status === 'suspended' ? 'stone' : 
                  'amber'
                }
                dot
              >
                {tenant.status}
              </Badge>
            </div>
            
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-ink-muted">Type</span>
                <span className="text-ink capitalize">{(tenant as any).type || 'both'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Owner</span>
                <span className="text-ink">{tenant.ownerEmail}</span>
              </div>
              <div className="flex justify-between items-center">
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
              <div className="flex justify-between">
                <span className="text-ink-muted">Created</span>
                <span className="text-ink">{new Date(tenant.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 pt-4 border-t border-stone-200">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                disabled={tenant.status !== 'active'}
                onClick={() => handleImpersonate(tenant)}
                title={tenant.status !== 'active' ? 'Activate tenant before impersonating' : `Open ${tenant.name} dashboard`}
              >
                <UserCheck className="w-4 h-4" />
                Impersonate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                onClick={() => handleToggleStatus(tenant)}
              >
                <Power className="w-4 h-4" />
                {tenant.status === 'active' ? 'Suspend' : 'Activate'}
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {filteredTenants.length === 0 && (
        <div className="text-center py-16">
          <p className="text-ink-muted">No tenants found</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-stone-200 pt-4 text-sm text-ink-muted">
          <span>Showing page {page} of {totalPages} ({totalTenants} total)</span>
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
          <h2 className="text-lg font-bold text-ink mb-3">Recent Platform Audit Log</h2>
          <div className="divide-y divide-stone-100 text-sm">
            {auditLogs.slice(0, 15).map((log) => (
              <div key={log.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs bg-stone-100 px-2 py-0.5 rounded text-ink mr-2">{log.action}</span>
                  <span className="text-ink-muted">{log.targetType}{log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ''}</span>
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
        className="p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <h2 id="create-tenant-title" className="font-serif text-2xl font-bold mb-6">Create New Tenant</h2>
        <div className="space-y-4">
          {/* Type Selection */}
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
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="text-blue-900">An invitation email will be sent to the owner so they can set their own password and access their dashboard.</p>
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

      {/* Invitation Success Dialog */}
      <Dialog
        open={Boolean(inviteMessage)}
        onClose={() => setInviteMessage(null)}
        labelledBy="invite-sent-title"
        className="p-8 max-w-md w-full"
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 id="invite-sent-title" className="font-serif text-2xl font-bold text-ink mb-2">Invitation Sent!</h2>
          <p className="text-ink-muted">{inviteMessage}</p>
        </div>

        <Button
          variant="terra"
          className="w-full mt-2"
          onClick={() => {
            setInviteMessage(null);
            setToast({ message: 'Tenant created successfully', type: 'success' });
            setTimeout(() => setToast(null), 5000);
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
            {toast.type === 'success' ? (
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
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
