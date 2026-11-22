'use client';

import { X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/currency';
import { RoomDialog, RoomType } from './types';

interface AddRoomModalProps {
  dialog: RoomDialog;
  roomTypes: RoomType[];
  form: { roomNumber: string; roomTypeId: string; floor: string };
  setForm: (form: { roomNumber: string; roomTypeId: string; floor: string }) => void;
  formError: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function AddRoomModal({
  dialog,
  roomTypes,
  form,
  setForm,
  formError,
  saving,
  onClose,
  onSave,
}: AddRoomModalProps) {
  const roomTypeOptions = roomTypes.map(rt => ({
    value: rt.id,
    label: `${rt.name} - ${formatCurrency(Number(rt.basePrice))}/night`,
  }));

  return (
    <Dialog
      open={!!dialog}
      onClose={onClose}
      labelledBy="room-title"
      dismissible={!saving}
      className="p-8 max-w-md w-full"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 id="room-title" className="font-serif text-2xl font-bold">
          {dialog?.mode === 'edit' ? `Edit room ${dialog.room.roomNumber}` : 'Add room'}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-ink-muted hover:text-ink rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4">
        <Input
          label="Room number"
          placeholder="101"
          value={form.roomNumber}
          onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
        />
        <Select
          label="Room type"
          value={form.roomTypeId}
          onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })}
          options={roomTypeOptions}
        />
        <Input
          label="Floor"
          type="number"
          inputMode="numeric"
          placeholder="1"
          value={form.floor}
          onChange={(e) => setForm({ ...form, floor: e.target.value })}
        />

        {formError && (
          <p role="alert" className="rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">
            {formError}
          </p>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : dialog?.mode === 'edit' ? 'Save changes' : 'Add room'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
