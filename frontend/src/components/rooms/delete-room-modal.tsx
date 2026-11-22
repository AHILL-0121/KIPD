'use client';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Room } from './types';

interface DeleteRoomModalProps {
  room: Room | null;
  formError: string;
  saving: boolean;
  onClose: () => void;
  onDelete: () => void;
}

export function DeleteRoomModal({
  room,
  formError,
  saving,
  onClose,
  onDelete,
}: DeleteRoomModalProps) {
  return (
    <Dialog
      open={!!room}
      onClose={onClose}
      labelledBy="delete-title"
      dismissible={!saving}
      className="p-8 max-w-md w-full"
    >
      {room && (
        <>
          <h2 id="delete-title" className="text-2xl font-bold text-ink">
            Delete room {room.roomNumber}?
          </h2>
          <p className="text-ink-muted mt-2">
            This removes the room from your list. It can&apos;t be undone.
          </p>
          {formError && (
            <p role="alert" className="mt-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">
              {formError}
            </p>
          )}
          <div className="mt-6 flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={onClose} disabled={saving}>
              Keep room
            </Button>
            <Button variant="terra" className="flex-1" onClick={onDelete} disabled={saving}>
              {saving ? 'Deleting…' : 'Delete room'}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
