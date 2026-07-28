'use client';

import { useState } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const [propertySettings, setPropertySettings] = useState({
    name: '',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    currency: 'USD',
    timezone: 'America/New_York',
  });

  const [receiptSettings, setReceiptSettings] = useState({
    header: 'KIPD RESTAURANT',
    subtext: 'GST INVOICE • WALK-IN',
    footer: 'We Are Happy To Serve You'
  });

  useEffect(() => {
    const saved = localStorage.getItem('kipd-receipt-config');
    if (saved) {
      setReceiptSettings(JSON.parse(saved));
    }
  }, []);

  const saveReceiptSettings = async () => {
    // Save locally for immediate offline support
    localStorage.setItem('kipd-receipt-config', JSON.stringify(receiptSettings));

    // Send PATCH request to API
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptSettings }),
      });
      alert('Receipt Layout successfully saved!');
    } catch (error) {
      alert('Failed to save layout to server, but saved locally.');
    }
  };

  const [outlets, setOutlets] = useState<Array<{
    id: string;
    name: string;
    type: string;
    isActive: boolean;
  }>>([]);

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
        if (data.outlets) setOutlets(data.outlets);
        if (data.webhooks) setWebhooks(data.webhooks);
      })
      .catch(() => {
        // Keep defaults
      });
  }, []);

  const saveSettings = async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertySettings }),
    });
    // Show success toast
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

            <Button variant="ghost" size="sm">
              <Plus className="w-4 h-4" />
              Add Outlet
            </Button>
          </div>

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
                  <button className="text-ink-muted hover:text-terra">
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
