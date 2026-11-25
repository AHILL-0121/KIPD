'use client';

import { useState } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toaster';
import { confirmDialog } from '@/components/ui/confirm';
import { useTenantInfo } from '@/contexts/tenant-context';
import { PaymentSettingsCard } from '@/components/settings/payment-settings-card';
import { RazorpayConnectionCard } from '@/components/settings/razorpay-connection-card';
import { TaxSettingsCard } from '@/components/settings/tax-settings-card';
import {
  Settings as SettingsIcon,
  Building2,
  Utensils,
  Webhook,
  Save,
  Plus,
  Trash2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect } from 'react';

export default function SettingsPage() {
  const { reload: reloadTenantInfo } = useTenantInfo();
  const [propertySettings, setPropertySettings] = useState({
    name: '',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  });

  const [receiptSettings, setReceiptSettings] = useState({
    header: 'KIPD RESTAURANT',
    subtext: 'GST INVOICE • WALK-IN',
    footer: 'We Are Happy To Serve You'
  });

  const saveReceiptSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptSettings }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast('success', 'Receipt layout saved');
    } catch {
      toast('error', 'Could not save the receipt layout', 'Please try again.');
    }
  };

  const [outlets, setOutlets] = useState<Array<{
    id: string;
    name: string;
    type: string;
    isActive: boolean;
  }>>([]);
  const [showAddOutlet, setShowAddOutlet] = useState(false);
  const [newOutletName, setNewOutletName] = useState('');
  const [newOutletType, setNewOutletType] = useState<'restaurant' | 'bar' | 'cafe' | 'room_service'>('restaurant');
  const [savingOutlet, setSavingOutlet] = useState(false);
  const [planUsage, setPlanUsage] = useState<{
    plan: string;
    limits: { rooms: number | null; tables: number | null; outlets: number | null; staff: number | null };
    usage: { rooms: number; tables: number; outlets: number; staff: number };
  } | null>(null);

  const [webhooks, setWebhooks] = useState<Array<{
    id: string;
    url: string;
    events: string[];
    isActive: boolean;
  }>>([]);

  useEffect(() => {
    // Fetch settings from API
    fetch('/api/settings')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        if (data.propertySettings) setPropertySettings(data.propertySettings);
        if (data.receiptSettings) setReceiptSettings(data.receiptSettings);
        if (data.outlets) setOutlets(data.outlets);
        if (data.webhooks) setWebhooks(data.webhooks);
        if (data.plan && data.limits && data.usage) {
          setPlanUsage({ plan: data.plan, limits: data.limits, usage: data.usage });
        }
      })
      .catch(() => {
        // Keep defaults
      });
  }, []);

  const handleCreateOutlet = async () => {
    if (!newOutletName.trim()) {
      toast('error', 'Outlet name is required');
      return;
    }
    setSavingOutlet(true);
    try {
      const res = await fetch('/api/outlets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOutletName.trim(), type: newOutletType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add outlet');
      if (data.outlet) setOutlets((prev) => [...prev, data.outlet]);
      setNewOutletName('');
      setShowAddOutlet(false);
      reloadTenantInfo();
      toast('success', 'Outlet created');
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not create outlet');
    } finally {
      setSavingOutlet(false);
    }
  };

  const handleDeleteOutlet = async (outlet: { id: string; name: string }) => {
    if (
      !(await confirmDialog({
        title: `Delete "${outlet.name}"?`,
        message: 'Outlets with existing tables, menus, or orders cannot be deleted.',
        confirmLabel: 'Delete outlet',
        danger: true,
      }))
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/outlets?id=${outlet.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete outlet');
      setOutlets((prev) => prev.filter((o) => o.id !== outlet.id));
      reloadTenantInfo();
      toast('success', 'Outlet deleted');
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not delete outlet');
    }
  };

  const saveSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertySettings }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast('success', 'Property settings saved');
    } catch {
      toast('error', 'Could not save property settings', 'Check the values and try again.');
    }
  };

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="mb-8">
        <h1 className="section-title">Settings</h1>
        <p className="section-sub">Configure your property and integrations</p>
      </div>

      <div className="max-w-4xl space-y-8">
        {/* Property Settings */}
        <Card hover={false}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>Property Settings</CardTitle>
              <CardDescription>Basic information and policies</CardDescription>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Property Name"
              value={propertySettings.name}
              onChange={(e) => setPropertySettings({ ...propertySettings, name: e.target.value })}
            />

            <Select
              label="Currency"
              value={propertySettings.currency}
              onChange={(e) => setPropertySettings({ ...propertySettings, currency: e.target.value })}
              options={[
                { value: 'INR', label: 'INR - Indian Rupee' },
                { value: 'USD', label: 'USD - US Dollar' },
                { value: 'EUR', label: 'EUR - Euro' },
                { value: 'GBP', label: 'GBP - British Pound' },
              ]}
            />

            <Input
              label="Check-in Time"
              type="time"
              value={propertySettings.checkInTime}
              onChange={(e) => setPropertySettings({ ...propertySettings, checkInTime: e.target.value })}
            />

            <Input
              label="Check-out Time"
              type="time"
              value={propertySettings.checkOutTime}
              onChange={(e) => setPropertySettings({ ...propertySettings, checkOutTime: e.target.value })}
            />

            <Select
              label="Timezone"
              value={propertySettings.timezone}
              onChange={(e) => setPropertySettings({ ...propertySettings, timezone: e.target.value })}
              options={[
                { value: 'Asia/Kolkata', label: 'India (IST)' },
                { value: 'Europe/London', label: 'London' },
                { value: 'America/New_York', label: 'Eastern Time' },
                { value: 'America/Chicago', label: 'Central Time' },
                { value: 'America/Los_Angeles', label: 'Pacific Time' },
              ]}
            />
          </div>

          <div className="flex justify-end mt-6 pt-6 border-t border-stone-200">
            <Button onClick={saveSettings}>
              <Save className="w-4 h-4" />
              Save Changes
            </Button>
          </div>
        </Card>

        {/* Payments */}
        <PaymentSettingsCard />
        <RazorpayConnectionCard />

        {/* Tax & invoices */}
        <TaxSettingsCard />

        {/* Plan & Quotas */}
        {planUsage && (
          <Card hover={false}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <CardTitle>Plan &amp; Usage</CardTitle>
                <CardDescription>Resource quotas enforced on your current subscription tier</CardDescription>
              </div>
              <Badge variant="amber" className="capitalize">
                {planUsage.plan} plan
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {(['rooms', 'tables', 'outlets', 'staff'] as const).map((k) => {
                const used = planUsage.usage[k];
                const cap = planUsage.limits[k];
                return (
                  <div key={k} className="p-3 rounded-xl bg-cream border border-stone-200">
                    <div className="text-xs text-ink-muted capitalize">{k}</div>
                    <div className="font-semibold text-ink mt-0.5">
                      {used} / {cap === null ? 'Unlimited' : cap}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Outlets */}
        <Card hover={false}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-terra rounded-lg flex items-center justify-center">
                <Utensils className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle>Outlets</CardTitle>
                <CardDescription>Manage restaurants and service points</CardDescription>
              </div>
            </div>

            <Button variant="ghost" size="sm" onClick={() => setShowAddOutlet((s) => !s)}>
              <Plus className="w-4 h-4" />
              Add Outlet
            </Button>
          </div>

          {showAddOutlet && (
            <div className="mb-5 p-4 rounded-xl bg-cream border border-stone-200 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-ink">Outlet Name</label>
                <Input
                  value={newOutletName}
                  onChange={(e) => setNewOutletName(e.target.value)}
                  placeholder="e.g. Rooftop Bar"
                />
              </div>
              <div className="sm:w-44 space-y-1">
                <label className="text-xs font-medium text-ink">Type</label>
                <Select
                  value={newOutletType}
                  onChange={(e) => setNewOutletType(e.target.value as 'restaurant' | 'bar' | 'cafe' | 'room_service')}
                  options={[
                    { value: 'restaurant', label: 'Restaurant' },
                    { value: 'bar', label: 'Bar' },
                    { value: 'cafe', label: 'Cafe' },
                    { value: 'room_service', label: 'Room Service' },
                  ]}
                />
              </div>
              <Button onClick={handleCreateOutlet} disabled={savingOutlet}>
                {savingOutlet ? 'Saving...' : 'Save Outlet'}
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {outlets.map((outlet) => (
              <motion.div
                key={outlet.id}
                className="flex items-center justify-between p-4 bg-cream rounded-xl border border-stone-200"
                whileHover={{ scale: 1.01 }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-lg">{outlet.type === 'restaurant' ? '🍽️' : outlet.type === 'bar' ? '🍷' : '🛎️'}</div>
                  <div>
                    <div className="font-medium text-ink">{outlet.name}</div>
                    <div className="text-sm text-ink-muted capitalize">{outlet.type.replace('_', ' ')}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={outlet.isActive ? 'sage' : 'stone'} dot>
                    {outlet.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => handleDeleteOutlet(outlet)}
                    aria-label={`Delete ${outlet.name}`}
                    className="text-ink-muted hover:text-terra min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>

        {/* Receipt Designer */}
        <Card hover={false}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber rounded-lg flex items-center justify-center">
                <SettingsIcon className="w-5 h-5 text-ink" />
              </div>
              <div>
                <CardTitle>Thermal Receipt UI Editor</CardTitle>
                <CardDescription>Customize the 80mm ESC/POS hardware printout typography.</CardDescription>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Header Brand Name</label>
                <Input
                  value={receiptSettings.header}
                  onChange={e => setReceiptSettings({ ...receiptSettings, header: e.target.value.toUpperCase() })}
                  placeholder="e.g. KIPD RESTAURANT"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Invoice Subtext (Tax Type)</label>
                <Input
                  value={receiptSettings.subtext}
                  onChange={e => setReceiptSettings({ ...receiptSettings, subtext: e.target.value.toUpperCase() })}
                  placeholder="e.g. GST INVOICE • WALK-IN"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Footer Message</label>
                <Input
                  value={receiptSettings.footer}
                  onChange={e => setReceiptSettings({ ...receiptSettings, footer: e.target.value.toUpperCase() })}
                  placeholder="e.g. WELLNESS AND HOSPITALITY"
                />
              </div>
              <Button onClick={saveReceiptSettings} variant="sage" className="w-full mt-4">
                <Save className="w-4 h-4" /> Save Layout Changes
              </Button>
            </div>

            {/* Live Visual Preview Engine */}
            <div className="flex items-center justify-center bg-stone-100 p-8 rounded-xl border border-stone-200">
              <div className="p-4 bg-white border border-stone-300 font-mono text-xs w-full max-w-[260px] shadow-sm">
                <div className="text-center mb-4 pb-4 border-b border-dashed border-stone-300">
                  <h3 className="font-bold text-lg leading-tight uppercase tracking-widest mb-1">{receiptSettings.header || '...'}</h3>
                  <p className="text-[10px] text-stone-500 uppercase leading-none">{receiptSettings.subtext || '...'}</p>
                </div>
                <div className="h-20 flex items-center justify-center text-stone-300 text-xs text-center border-y border-dashed border-stone-200 mb-4">
                  [ Order Data Simulation ]
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-stone-500 font-bold tracking-widest uppercase">{receiptSettings.footer || '...'}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div >
  );
}
