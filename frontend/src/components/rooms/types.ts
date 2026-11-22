import { type LucideIcon, Check, User, Sparkles, Wrench, Ban } from 'lucide-react';
import { type RoomStatus } from '@/lib/room-status';

export interface RoomType {
  id: string;
  name: string;
  basePrice: string;
  maxOccupancy: number;
  amenities: string[];
  description: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  roomType: RoomType;
  floor: number;
  status: RoomStatus;
}

/** The part of a booking this page needs: who is in a room, and until when. */
export interface Stay {
  id: string;
  roomId: string;
  status: string;
  checkOutDate: string;
  guest?: { name: string };
}

export type RoomDialog = { mode: 'add' } | { mode: 'edit'; room: Room } | null;
export type Toast = { message: string; type: 'success' | 'error'; undo?: () => void };

export const EMPTY_ROOM = { roomNumber: '', roomTypeId: '', floor: '1' };
export const EMPTY_TYPE = { name: '', basePrice: '', maxOccupancy: '2', description: '' };

export const STATUS_ICON: Record<RoomStatus, LucideIcon> = {
  available: Check,
  occupied: User,
  cleaning: Sparkles,
  maintenance: Wrench,
  blocked: Ban,
};

export const IDLE_NOTE: Record<RoomStatus, string> = {
  available: 'Ready to sell',
  occupied: 'Guest in the room',
  cleaning: 'Housekeeping in progress',
  maintenance: 'Needs repair before it can be sold',
  blocked: 'Not for sale',
};

export const floorName = (f: number) => (f === 0 ? 'Ground floor' : `Floor ${f}`);

/** The server's own message when it gave one ("This item is still in use…"), otherwise ours. */
export async function failure(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === 'string' && res.status < 500) return body.error;
  } catch {
    /* not JSON */
  }
  return fallback;
}
