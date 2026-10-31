import { bills } from '@/db/schema';

/** Nights between two instants: at least one, and a part-day counts as a night (the same rule the booking price uses). */
export const nightsBetween = (checkIn: Date, checkOut: Date) => Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86_400_000));

interface StayBillInput {
  tenantId: string;
  bookingId: string;
  guestId: string;
  roomNumber: string;
  roomTypeName: string;
  checkIn: Date;
  checkOut: Date;
  /** The booking's price: nights x the room type's rate. */
  total: string;
}

/**
 * The bill for a hotel stay, as one line (room, type, nights). No tax is added yet: the booking price is
 * what the guest owes until the tax profile exists (checklist 7a, "Room GST"). Insert it with
 * onConflictDoNothing(): a booking can only have one live stay bill, so confirming twice is harmless.
 */
export function stayBillValues(i: StayBillInput): typeof bills.$inferInsert {
  const nights = nightsBetween(i.checkIn, i.checkOut);
  const total = Number(i.total);
  return {
    tenantId: i.tenantId,
    bookingId: i.bookingId,
    kind: 'stay',
    guestId: i.guestId,
    totalAmount: i.total,
    status: 'open',
    itemsBreakdown: {
      items: [{
        name: `Room ${i.roomNumber} (${i.roomTypeName}), ${nights} ${nights === 1 ? 'night' : 'nights'}`,
        qty: nights,
        rate: Math.round((total / nights) * 100) / 100,
        amt: total,
      }],
      subtotal: total, cgst: 0, sgst: 0, total,
    },
  };
}
