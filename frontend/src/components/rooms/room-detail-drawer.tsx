'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import { roomStatus } from '@/lib/room-status';
import { Room, Stay } from './types';

interface ActionItem {
  label: string;
  primary?: boolean;
  run: () => void;
}

interface RoomDetailDrawerProps {
  selected: Room | null;
  stay?: Stay;
  onClose: () => void;
  actions: ActionItem[];
  onOpenEdit: (room: Room) => void;
  onOpenDelete: (room: Room) => void;
}

export function RoomDetailDrawer({
  selected,
  stay,
  onClose,
  actions,
  onOpenEdit,
  onOpenDelete,
}: RoomDetailDrawerProps) {
  return (
    <Dialog open={!!selected} onClose={onClose} labelledBy="drawer-title" variant="drawer">
      {selected && (
        <>
          <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-stone-200">
            <div>
              <h2 id="drawer-title" className="text-[1.375rem] font-semibold text-ink">
                Room {selected.roomNumber}
              </h2>
              <div className="mt-2">
                <Badge variant={roomStatus(selected.status).tone}>
                  {roomStatus(selected.status).label}
                </Badge>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-lg text-ink-muted hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-ink-muted">Type</dt>
              <dd className="font-medium text-ink">{selected.roomType?.name || 'Unknown'}</dd>
              <dt className="text-ink-muted">Floor</dt>
              <dd className="font-medium text-ink">{selected.floor || 1}</dd>
              <dt className="text-ink-muted">Rate</dt>
              <dd className="font-medium text-ink">
                {formatCurrency(Number(selected.roomType?.basePrice || 0))} a night
              </dd>
              {selected.roomType?.maxOccupancy ? (
                <>
                  <dt className="text-ink-muted">Sleeps</dt>
                  <dd className="font-medium text-ink">{selected.roomType.maxOccupancy}</dd>
                </>
              ) : null}
              {stay?.guest?.name && (
                <>
                  <dt className="text-ink-muted">Guest</dt>
                  <dd className="font-medium text-ink">{stay.guest.name}</dd>
                </>
              )}
              {stay && (
                <>
                  <dt className="text-ink-muted">Check-out</dt>
                  <dd className="font-medium text-ink">
                    {format(new Date(stay.checkOutDate), 'EEE d MMM yyyy')}
                  </dd>
                </>
              )}
            </dl>
          </div>

          <footer className="grid gap-2.5 px-6 py-4 border-t border-stone-200">
            {selected.status === 'available' && (
              <Link
                href={`/dashboard/bookings?new=1&room=${selected.id}`}
                className="inline-flex items-center justify-center h-[46px] rounded-lg bg-amber text-white font-medium hover:bg-amber-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
              >
                Create booking
              </Link>
            )}
            {actions.map(a => (
              <Button
                key={a.label}
                variant={a.primary ? 'primary' : 'ghost'}
                className="w-full h-[46px]"
                onClick={a.run}
              >
                {a.label}
              </Button>
            ))}
            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => onOpenEdit(selected)}
              >
                Edit details<span className="sr-only"> for room {selected.roomNumber}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-terra hover:bg-terra-pale"
                onClick={() => onOpenDelete(selected)}
              >
                Delete room<span className="sr-only"> {selected.roomNumber}</span>
              </Button>
            </div>
          </footer>
        </>
      )}
    </Dialog>
  );
}
