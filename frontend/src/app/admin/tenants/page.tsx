'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, MoreVertical, Power, Edit, Trash2 } from 'lucide-react';
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

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    ownerEmail: '',
    type: 'both' as 'hotel' | 'restaurant' | 'both',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/tenants')
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch tenants');
        }
        return res.json();
      })
      .then(data => {
        // Ensure data is an array
        setTenants(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error('Error fetching tenants:', err);
        setTenants([]);
      });
  }, []);

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) || 
                         t.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
      const updatedTenants = await fetch('/api/admin/tenants').then(r => r.json());
      setTenants(Array.isArray(updatedTenants) ? updatedTenants : []);
      
      // Reset form and close modal
      setFormData({ name: '', slug: '', ownerEmail: '', type: 'both' });
      setShowNewModal(false);
      
      // Show credentials if new user was created
      if (result.credentials) {
        setCredentials(result.credentials);
      } else {
        setToast({ message: result.message || 'Tenant created successfully', type: 'success' });
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

  const handleDeleteTenant = async (tenantId: string, tenantName: string) => {
    if (!confirm(`Are you sure you want to delete "${tenantName}"? This action cannot be undone.`)) {
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
      const updatedTenants = await fetch('/api/admin/tenants').then(r => r.json());
      setTenants(Array.isArray(updatedTenants) ? updatedTenants : []);

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
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <Input
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>
        
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Status' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'pending', label: 'Pending' },
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
              <div className="flex justify-between">
                <span className="text-ink-muted">Created</span>
                <span className="text-ink">{new Date(tenant.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            
            <div className="flex gap-2 pt-4 border-t border-stone-200">
              <Button size="sm" variant="ghost" className="flex-1">
                <Edit className="w-4 h-4" />
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="flex-1">
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

      {/* Create Modal */}
      <AnimatePresence>
        {showNewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowNewModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-serif text-2xl font-bold mb-6">Create New Tenant</h2>
              
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
                        onClick={() => setFormData({ ...formData, type: opt.value as any })}
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
                
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <p className="text-amber-900">💡 An account will be created with a secure password. Login credentials will be displayed after creation.</p>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credentials Modal */}
      <AnimatePresence>
        {credentials && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setCredentials(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="font-serif text-2xl font-bold text-ink mb-2">Tenant Created!</h2>
                <p className="text-ink-muted">Save these login credentials and share them with the tenant owner</p>
              </div>

              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
                  <label className="text-sm font-medium text-ink-muted block mb-2">Email</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-ink font-mono text-sm">{credentials.email}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(credentials.email);
                        setToast({ message: 'Email copied!', type: 'success' });
                        setTimeout(() => setToast(null), 2000);
                      }}
                      className="px-3 py-1 text-xs bg-white border border-stone-300 rounded hover:bg-stone-50"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
                  <label className="text-sm font-medium text-ink-muted block mb-2">Password</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-ink font-mono text-sm">{credentials.password}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(credentials.password);
                        setToast({ message: 'Password copied!', type: 'success' });
                        setTimeout(() => setToast(null), 2000);
                      }}
                      className="px-3 py-1 text-xs bg-white border border-stone-300 rounded hover:bg-stone-50"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <p className="text-amber-900">⚠️ Make sure to save these credentials! They won't be shown again.</p>
                </div>
              </div>

              <Button 
                variant="terra" 
                className="w-full mt-6"
                onClick={() => {
                  setCredentials(null);
                  setToast({ message: 'Tenant created successfully', type: 'success' });
                  setTimeout(() => setToast(null), 5000);
                }}
              >
                Done
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="font-medium">{toast.message}</span>
            <button 
              onClick={() => setToast(null)}
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
