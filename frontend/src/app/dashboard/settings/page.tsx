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
    <div className="p-8">
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

          <div className="grid grid-cols-2 gap-4">
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

        {/* Webhooks */}
        <Card hover={false}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sage rounded-lg flex items-center justify-center">
                <Webhook className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>Configure event notifications</CardDescription>
              </div>
            </div>
            
            <Button variant="ghost" size="sm">
              <Plus className="w-4 h-4" />
              Add Webhook
            </Button>
          </div>

          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="p-4 bg-cream rounded-xl border border-stone-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="font-mono text-sm text-ink mb-2">{webhook.url}</div>
                    <div className="flex flex-wrap gap-2">
                      {webhook.events.map((event) => (
                        <Badge key={event} variant="stone">
                          {event}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Badge variant={webhook.isActive ? 'sage' : 'stone'} dot>
                      {webhook.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <button className="text-ink-muted hover:text-terra">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
