import type { StatusTone } from '@/lib/order-status';

export type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'blocked';

/**
 * How a room's status reads, following the design sample: free is green, a guest in it is the brand colour,
 * cleaning and blocked are neutral, and out of order is the one red state, because it needs someone to act.
 */
export const ROOM_STATUS: Record<RoomStatus, { label: string; tone: StatusTone }> = {
  available: { label: 'Available', tone: 'sage' },
  occupied: { label: 'Occupied', tone: 'amber' },
  cleaning: { label: 'Cleaning', tone: 'stone' },
  maintenance: { label: 'Out of order', tone: 'terra' },
  blocked: { label: 'Blocked', tone: 'stone' },
};

export const ROOM_STATUS_ORDER = Object.keys(ROOM_STATUS) as RoomStatus[];
export const ROOM_STATUS_OPTIONS = ROOM_STATUS_ORDER.map(value => ({ value, label: ROOM_STATUS[value].label }));

export function roomStatus(status: string) {
  return ROOM_STATUS[status as RoomStatus] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), tone: 'stone' as StatusTone };
}
