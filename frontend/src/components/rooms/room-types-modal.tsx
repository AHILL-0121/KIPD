'use client';

import { X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/currency';
import { RoomType } from './types';

interface RoomTypesModalProps {
  open: boolean;
  roomTypes: RoomType[];
  form: { name: string; basePrice: string; maxOccupancy: string; description: string };
  setForm: (form: { name: string; basePrice: string; maxOccupancy: string; description: string }) => void;
  formError: string;
  saving: boolean;
  onClose: () => void;
  onCreateType: () => void;
}

export function RoomTypesModal({
  open,
  roomTypes,
  form,
  setForm,
  formError,
  saving,
  onClose,
  onCreateType,
}: RoomTypesModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="types-title"
      dismissible={!saving}
      className="p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 id="types-title" className="font-serif text-2xl font-bold">Room types</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-muted hover:text-ink rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4">
        {roomTypes.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-ink mb-2">Your room types</h3>
            <ul className="space-y-2 max-h-32 overflow-y-auto">
              {roomTypes.map(rt => (
                <li key={rt.id} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-sm">
                  <span className="font-medium">{rt.name}</span>
                  <span className="text-ink-muted">{formatCurrency(Number(rt.basePrice))}/night</span>
                </li>
              ))}
            </ul>
            <hr className="mt-4" />
          </div>
        )}

        <h3 className="text-sm font-medium text-ink">Add a room type</h3>
        <Input
          label="Name"
          placeholder="Deluxe Suite"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          label="Price per night (₹)"
          type="number"
          inputMode="decimal"
          placeholder="3000"
          value={form.basePrice}
          onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
        />
        <Input
          label="Most guests"
          type="number"
          inputMode="numeric"
          placeholder="2"
          value={form.maxOccupancy}
          onChange={(e) => setForm({ ...form, maxOccupancy: e.target.value })}
        />
        <Input
          label="Description (optional)"
          placeholder="A quiet room with a city view"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        {formError && (
          <p role="alert" className="rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">
            {formError}
          </p>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button className="flex-1" onClick={onCreateType} disabled={saving}>
            {saving ? 'Adding…' : 'Add room type'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
