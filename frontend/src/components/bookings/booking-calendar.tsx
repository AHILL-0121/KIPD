'use client';

import { useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format, isToday, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { bookingStatus, type BookingStatus } from '@/lib/booking-status';
import type { StatusTone } from '@/lib/order-status';

export interface CalendarBooking {
  id: string;
  status: BookingStatus;
  checkInDate: string;
  checkOutDate: string;
  guest?: { name?: string };
  room?: { id: string; roomNumber: string };
}
export interface CalendarRoom { id: string; roomNumber: string }

const DAYS = 14;

const TONE: Record<StatusTone, string> = {
  amber: 'bg-amber-pale border-amber/40 text-amber-deep',
  sage: 'bg-sage-pale border-sage/40 text-sage',
  stone: 'bg-stone-100 border-stone-300 text-ink-soft',
  terra: 'bg-terra-pale border-terra/40 text-terra',
};

/**
 * Rooms down the side, days across the top. A stay covers its nights: the check-out day is left free,
 * so one guest leaving and the next arriving on the same day sit side by side. Cancelled bookings are
 * hidden because they no longer hold the room.
 */
export function BookingCalendar({ bookings, rooms, onSelect }: { bookings: CalendarBooking[]; rooms: CalendarRoom[]; onSelect: (id: string) => void }) {
  const [start, setStart] = useState(() => startOfDay(new Date()));
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(start, i)), [start]);

  const rows = useMemo(() => {
    const known = new Map(rooms.map(r => [r.id, r.roomNumber]));
    for (const b of bookings) if (b.room && !known.has(b.room.id)) known.set(b.room.id, b.room.roomNumber);
    return Array.from(known, ([id, roomNumber]) => ({ id, roomNumber }))
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  }, [rooms, bookings]);

  const placed = (b: CalendarBooking) => {
    const from = differenceInCalendarDays(new Date(b.checkInDate), start);
    const to = differenceInCalendarDays(new Date(b.checkOutDate), start); // exclusive
    const a = Math.max(from, 0), z = Math.min(Math.max(to, from + 1), DAYS);
    return z > a ? { a, z, clippedLeft: from < 0, clippedRight: to > DAYS } : null;
  };

  if (rows.length === 0) {
    return <p className="rounded-xl border border-stone-200 bg-white p-8 text-center text-ink-muted">Add rooms on the Rooms page and their bookings will appear here.</p>;
  }

  const rangeLabel = `${format(days[0], 'd MMM')} – ${format(days[DAYS - 1], 'd MMM yyyy')}`;
  const navBtn = 'h-9 px-3 rounded-lg border border-stone-200 bg-white text-sm font-medium text-ink-soft hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber';

  return (
    <section aria-label="Booking calendar" className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink" aria-live="polite">{rangeLabel}</h2>
        <div className="flex items-center gap-2">
          <button type="button" className={navBtn} onClick={() => setStart(s => addDays(s, -7))} aria-label="Previous week"><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
          <button type="button" className={navBtn} onClick={() => setStart(startOfDay(new Date()))}>Today</button>
          <button type="button" className={navBtn} onClick={() => setStart(s => addDays(s, 7))} aria-label="Next week"><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[72px_repeat(14,1fr)] border-b border-stone-200 bg-stone-100/60">
            <span className="px-3 py-2 text-xs font-medium text-ink-muted">Room</span>
            {days.map(d => (
              <span key={d.toISOString()} className={`py-2 text-center text-[11px] leading-tight ${isToday(d) ? 'bg-amber-pale text-amber-deep font-semibold' : 'text-ink-muted'}`}>
                {format(d, 'EEE')}<br /><span className="text-sm text-ink">{format(d, 'd')}</span>
              </span>
            ))}
          </div>

          {rows.map(room => {
            const mine = bookings.filter(b => b.room?.id === room.id && b.status !== 'cancelled');
            return (
              <div key={room.id} className="relative grid grid-cols-[72px_repeat(14,1fr)] items-center h-11 border-b border-stone-100 last:border-b-0">
                <span className="px-3 font-mono text-xs text-ink-muted">{room.roomNumber}</span>
                {days.map((d, i) => (
                  <span key={i} aria-hidden="true" className={`h-full border-l border-stone-100 ${isToday(d) ? 'bg-amber-pale/40' : ''}`} style={{ gridColumn: i + 2, gridRow: 1 }} />
                ))}
                {mine.map(b => {
                  const p = placed(b);
                  if (!p) return null;
                  const st = bookingStatus(b.status);
                  const label = `${b.guest?.name || 'Guest'}, room ${room.roomNumber}, ${format(new Date(b.checkInDate), 'd MMM')} to ${format(new Date(b.checkOutDate), 'd MMM')}, ${st.label}. Open details`;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onSelect(b.id)}
                      aria-label={label}
                      title={`${b.guest?.name || 'Guest'} · ${st.label}`}
                      className={`z-10 mx-0.5 h-7 border px-2 text-left text-xs font-medium truncate hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber ${TONE[st.tone]} ${b.status === 'pending' ? 'border-dashed' : ''} ${p.clippedLeft ? 'rounded-l-none' : 'rounded-l-md'} ${p.clippedRight ? 'rounded-r-none' : 'rounded-r-md'}`}
                      style={{ gridColumn: `${p.a + 2} / ${p.z + 2}`, gridRow: 1 }}
                    >
                      {b.guest?.name || 'Guest'}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-stone-200 px-4 py-2.5 text-xs text-ink-muted" aria-label="Legend">
        {(['pending', 'confirmed', 'checked_in', 'checked_out'] as BookingStatus[]).map(s => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-5 rounded-sm border ${TONE[bookingStatus(s).tone]} ${s === 'pending' ? 'border-dashed' : ''}`} aria-hidden="true" />
            {bookingStatus(s).label}
          </li>
        ))}
      </ul>
    </section>
  );
}
