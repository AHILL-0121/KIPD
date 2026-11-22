'use client';

import { Room, Stay, floorName } from './types';
import { RoomCard } from './room-card';

interface FloorSectionProps {
  floor: number;
  rooms: Room[];
  stayFor: (room: Room) => Stay | undefined;
  onSelectRoom: (id: string) => void;
}

export function FloorSection({ floor, rooms, stayFor, onSelectRoom }: FloorSectionProps) {
  return (
    <section aria-labelledby={`floor-${floor}`} className="mb-8">
      <h2 id={`floor-${floor}`} className="flex items-baseline gap-2.5 text-base font-semibold text-ink mb-3">
        {floorName(floor)}
        <span className="text-sm font-normal text-ink-muted">
          {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
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
