import type { StatusTone } from '@/lib/order-status';

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';

/**
 * How a booking's status reads: a pending request is highlighted because someone has to answer it,
 * a guest in the house is the brand colour, and only cancelled is red (as on the Orders page).
 */
export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'sage' },
  checked_in: { label: 'In house', tone: 'amber' },
  checked_out: { label: 'Checked out', tone: 'stone' },
  cancelled: { label: 'Cancelled', tone: 'terra' },
};

export const BOOKING_STATUS_ORDER = Object.keys(BOOKING_STATUS) as BookingStatus[];

export function bookingStatus(status: string) {
  return BOOKING_STATUS[status as BookingStatus] ?? { label: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' '), tone: 'stone' as StatusTone };
}

/** What the front desk does next with a booking in this state. */
export const NEXT_ACTION: Partial<Record<BookingStatus, { action: 'confirm' | 'check-in' | 'check-out'; label: string }>> = {
  pending: { action: 'confirm', label: 'Confirm' },
  confirmed: { action: 'check-in', label: 'Check in' },
  checked_in: { action: 'check-out', label: 'Check out' },
};
