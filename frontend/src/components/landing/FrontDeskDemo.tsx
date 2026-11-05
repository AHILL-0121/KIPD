'use client';

import { useState } from 'react';
import { BOOKING_STATUS, NEXT_ACTION, type BookingStatus } from '@/lib/booking-status';
import type { StatusTone } from '@/lib/order-status';

const DAYS = [
  { d: 'Mon', n: 9 }, { d: 'Tue', n: 10 }, { d: 'Wed', n: 11 }, { d: 'Thu', n: 12 },
  { d: 'Fri', n: 13 }, { d: 'Sat', n: 14 }, { d: 'Sun', n: 15 },
];

type Bar = { room: string; from: number; to: number; guest: string; status: BookingStatus };

// from/to are column indexes into DAYS; "to" is the check-out day (exclusive), like a real stay.
const BOOKINGS: Bar[] = [
  { room: '101', from: 0, to: 3, guest: 'R. Nair', status: 'checked_in' },
  { room: '102', from: 2, to: 5, guest: 'Sharma party', status: 'confirmed' },
  { room: '203', from: 1, to: 3, guest: 'D. Fernandes', status: 'checked_in' },
  { room: '205', from: 4, to: 7, guest: 'A. Kulkarni', status: 'confirmed' },
];
const ROOMS = ['101', '102', '203', '204', '205'];
const REQUEST = { room: '204', from: 3, to: 5, guest: 'Meera Iyer' };

const TONE: Record<StatusTone, string> = {
  amber: 'bg-amber-pale border-amber/40 text-amber-deep',
  sage: 'bg-sage-pale border-sage/40 text-sage',
  stone: 'bg-stone-100 border-stone-300 text-ink-soft',
  terra: 'bg-terra-pale border-terra/40 text-terra',
};

export function FrontDeskDemo() {
  const [status, setStatus] = useState<BookingStatus>('pending');
  const [clash, setClash] = useState(false);
  const next = NEXT_ACTION[status];
  const tone = BOOKING_STATUS[status].tone;

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-lg overflow-hidden" aria-label="Front desk demo">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200 bg-stone-100/60">
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">Rooms · 9–15 Nov</span>
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-sage" /> Live
        </span>
      </div>

      {/* Timeline */}
      <div className="px-4 pt-3 pb-4 overflow-x-auto">
        <div className="min-w-[440px]">
          <div className="grid grid-cols-[44px_repeat(7,1fr)] text-center mb-1">
            <span />
            {DAYS.map(x => (
              <span key={x.n} className="text-[11px] text-ink-muted leading-tight">
                {x.d}<br /><b className="text-ink font-medium">{x.n}</b>
              </span>
            ))}
          </div>
          {ROOMS.map(room => {
            const own = BOOKINGS.find(b => b.room === room);
            const isReq = room === REQUEST.room;
            return (
              <div key={room} className="grid grid-cols-[44px_repeat(7,1fr)] items-center h-9 border-t border-stone-100">
                <span className="font-mono text-xs text-ink-muted">{room}</span>
                {DAYS.map((_, i) => <span key={i} className="h-full border-l border-stone-100" style={{ gridColumn: i + 2, gridRow: 1 }} />)}
                {own && (
                  <span
                    className={`z-10 h-6 rounded-md border px-2 text-[11px] leading-6 truncate ${TONE[BOOKING_STATUS[own.status].tone]}`}
                    style={{ gridColumn: `${own.from + 2} / ${own.to + 2}`, gridRow: 1 }}
                  >
                    {own.guest}
                  </span>
                )}
                {isReq && (
                  <span
                    className={`z-10 h-6 rounded-md border px-2 text-[11px] leading-6 truncate transition-colors ${TONE[tone]} ${status === 'pending' ? 'border-dashed' : ''}`}
                    style={{ gridColumn: `${REQUEST.from + 2} / ${REQUEST.to + 2}`, gridRow: 1 }}
                  >
                    {REQUEST.guest}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* The one decision the front desk has to make */}
      <div className="border-t border-stone-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {status === 'pending' ? 'Booking request' : 'Booking'} · {REQUEST.guest}
          </p>
          <p className="text-xs text-ink-muted">
            Room {REQUEST.room} · 12–14 Nov · 2 nights ·{' '}
            <span className="font-medium text-ink-soft" aria-live="polite">{BOOKING_STATUS[status].label}</span>
          </p>
        </div>
        {next ? (
          <button
            onClick={() => { setStatus(s => (s === 'pending' ? 'confirmed' : s === 'confirmed' ? 'checked_in' : 'checked_out')); setClash(false); }}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-white hover:bg-amber-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            {next.label}
          </button>
        ) : (
          <button
            onClick={() => setStatus('pending')}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-ink-soft hover:bg-stone-100"
          >
            Replay
          </button>
        )}
      </div>

      <div className="border-t border-stone-200 bg-stone-100/50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted" role="status">
          {clash
            ? 'Room 203 is already taken 10–12 Nov. Pick other dates or another room.'
            : 'Two guests can never hold the same room on the same night.'}
        </p>
        <button
          onClick={() => setClash(true)}
          className="text-xs font-medium text-amber hover:text-amber-deep underline underline-offset-2"
        >
          Try booking Room 203 on 11 Nov
        </button>
      </div>
    </div>
  );
}
