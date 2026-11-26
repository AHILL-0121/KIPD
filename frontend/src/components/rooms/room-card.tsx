'use client';

import { Check } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { roomStatus } from '@/lib/room-status';
import { useAppMessages } from '@/components/ui/i18n-provider';
import { Room, Stay, STATUS_ICON, IDLE_NOTE } from './types';

interface RoomCardProps {
  room: Room;
  stay?: Stay;
  onSelect: (id: string) => void;
}

export function RoomCard({ room, stay, onSelect }: RoomCardProps) {
  const m = useAppMessages();
  const status = roomStatus(room.status);
  const Icon = STATUS_ICON[room.status] ?? Check;
  const statusLabels: Record<string, string> = {
    available: m.rooms.available,
    occupied: m.rooms.occupied,
    cleaning: m.rooms.cleaning,
    maintenance: m.rooms.outOfOrder,
    dirty: m.rooms.dirty,
    inspected: m.rooms.inspected,
    blocked: m.rooms.blocked,
  };
  const label = statusLabels[room.status] ?? status.label;
  const idleNote = room.status === 'available' ? m.rooms.readyToSell : IDLE_NOTE[room.status];

  return (
    <button
      type="button"
      onClick={() => onSelect(room.id)}
      aria-label={`Room ${room.roomNumber}, ${status.label}. Open details`}
      className="flex flex-col gap-2.5 text-left min-h-[122px] p-4 bg-white border border-stone-200 rounded-xl shadow-sm transition-colors hover:border-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[1.375rem] font-semibold leading-tight text-ink">{room.roomNumber}</span>
        <Badge variant={status.tone}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          {label}
        </Badge>
      </div>
      <span className="text-sm text-ink-muted">
        {room.roomType?.name || 'Unknown'} · {formatCurrency(Number(room.roomType?.basePrice || 0))} {m.rooms.aNight}
      </span>
      <span className="mt-auto pt-2.5 border-t border-dashed border-stone-200 text-sm text-ink-soft">
        {stay?.guest?.name ? `${stay.guest.name} · out ${format(new Date(stay.checkOutDate), 'EEE d MMM')}` : idleNote}
      </span>
    </button>
  );
}
