'use client';

import { useAppMessages } from '@/components/ui/i18n-provider';
import { Room, Stay } from './types';
import { RoomCard } from './room-card';

interface FloorSectionProps {
  floor: number;
  rooms: Room[];
  stayFor: (room: Room) => Stay | undefined;
  onSelectRoom: (id: string) => void;
}

export function FloorSection({ floor, rooms, stayFor, onSelectRoom }: FloorSectionProps) {
  const m = useAppMessages();
  const label = floor === 0 ? m.rooms.groundFloor : `${m.rooms.floor} ${floor}`;
  return (
    <section aria-labelledby={`floor-${floor}`} className="mb-8">
      <h2 id={`floor-${floor}`} className="flex items-baseline gap-2.5 text-base font-semibold text-ink mb-3">
        {label}
        <span className="text-sm font-normal text-ink-muted">
          {rooms.length} {rooms.length === 1 ? m.rooms.room : m.rooms.roomsLabel}
        </span>
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {rooms.map(room => (
          <RoomCard
            key={room.id}
            room={room}
            stay={stayFor(room)}
            onSelect={onSelectRoom}
          />
        ))}
      </div>
    </section>
  );
}
