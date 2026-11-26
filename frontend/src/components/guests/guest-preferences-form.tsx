'use client';

import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';

interface GuestPreferencesFormProps {
  guestId: string;
  initialPreferences: Record<string, unknown>;
  initialNotes: string;
  onSaved?: () => void;
}

const SUGGESTED_PREFS: [string, string][] = [
  ['Pillow preference', 'Soft / Feather'],
  ['Room floor', 'High floor'],
  ['Dietary', 'Vegetarian'],
  ['Check-in time', 'Late arrival'],
];

export function GuestPreferencesForm({
  guestId,
  initialPreferences,
  initialNotes,
  onSaved,
}: GuestPreferencesFormProps) {
  const [rows, setRows] = useState<Array<{ key: string; value: string }>>(() =>
    Object.entries(initialPreferences ?? {}).map(([k, v]) => ({ key: k, value: String(v ?? '') })),
  );
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);

  const addRow = (key = '', value = '') => {
    setRows((prev) => [...prev, { key, value }]);
  };

  const updateRow = (index: number, field: 'key' | 'value', val: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: val } : r)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const preferences: Record<string, string> = {};
      for (const r of rows) {
        const k = r.key.trim();
        if (k) preferences[k] = r.value.trim();
      }
      const res = await fetch(`/api/guests/${guestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences, notes: notes.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update guest preferences');
      toast('success', 'Guest preferences saved');
      onSaved?.();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-ink">Guest Preferences</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => addRow()}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add preference
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {SUGGESTED_PREFS.map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                if (!rows.some((r) => r.key.toLowerCase() === k.toLowerCase())) addRow(k, v);
              }}
              className="text-xs px-2.5 py-1 rounded-full bg-stone-100 hover:bg-amber-pale text-ink-soft hover:text-amber-deep transition-colors"
            >
              + {k}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted py-3 border border-dashed border-stone-200 rounded-xl text-center">
            No preferences recorded yet. Add preferences like pillow choice, allergies, or room floor.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`Preference key ${index + 1}`}
                  placeholder="Preference (e.g. Room floor)"
                  value={row.key}
                  onChange={(e) => updateRow(index, 'key', e.target.value)}
                />
                <Input
                  aria-label={`Preference value ${index + 1}`}
                  placeholder="Value (e.g. High floor)"
                  value={row.value}
                  onChange={(e) => updateRow(index, 'value', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove preference ${row.key || index + 1}`}
                  className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-ink-muted hover:text-terra hover:bg-terra-pale flex items-center justify-center shrink-0"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-ink block mb-1.5">Staff Notes</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="VIP arrival notes, loyalty info, billing instructions..."
          className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-amber"
        />
      </label>

      <Button onClick={handleSave} disabled={saving} isLoading={saving}>
        <Save className="w-4 h-4" aria-hidden="true" />
        Save Preferences
      </Button>
    </div>
  );
}
