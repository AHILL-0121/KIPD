'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker, parseYmd, toYmd } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Plus, X } from 'lucide-react';
import { differenceInCalendarDays, format, isToday } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { realEmail } from '@/lib/guest-email';
import { BOOKING_STATUS_ORDER, NEXT_ACTION, bookingStatus, type BookingStatus } from '@/lib/booking-status';
import { motion, AnimatePresence } from 'framer-motion';

interface Booking {
  id: string;
  guest: { id: string; name: string; email: string; phone?: string };
  room: { id: string; roomNumber: string; roomType: { name: string; basePrice: string } };
  checkInDate: string;
  checkOutDate: string;
  numGuests: number;
  status: BookingStatus;
  totalAmount: string;
  source: string;
  specialRequests?: string;
}

interface AvailableRoom {
  id: string;
  roomNumber: string;
  roomType: { id: string; name: string; basePrice: string; maxOccupancy?: number };
  status: string;
}

const SOURCE_LABEL: Record<string, string> = { online: 'Online request', walk_in: 'Walk-in', staff: 'Added by staff' };
const ACTION_DONE: Record<string, string> = { confirm: 'confirmed', 'check-in': 'checked in', 'check-out': 'checked out', cancel: 'cancelled' };
const ACTIVE: BookingStatus[] = ['pending', 'confirmed', 'checked_in'];

const todayYmd = () => toYmd(new Date());
const dayAfter = (ymd: string) => {
  const d = parseYmd(ymd);
  return d ? toYmd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) : undefined;
};
const nightsBetween = (from: string, to: string) => {
  const a = parseYmd(from), b = parseYmd(to);
  return a && b ? Math.max(0, differenceInCalendarDays(b, a)) : 0;
};
const emptyForm = () => ({ roomId: '', guestName: '', guestEmail: '', guestPhone: '', checkInDate: todayYmd(), checkOutDate: dayAfter(todayYmd()) ?? '', numGuests: '1', specialRequests: '' });

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState(emptyForm());

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchBookings = () => {
    fetch('/api/bookings')
      .then(res => { if (!res.ok) throw new Error(`Bookings failed: ${res.status}`); return res.json(); })
      .then(data => { setBookings(Array.isArray(data) ? data : []); setStale(false); })
      .catch((err) => { console.error(err); setStale(true); }) // keep what is on screen, but say it may be out of date
      .finally(() => setLoading(false));
  };

  const fetchRooms = () => {
    fetch('/api/rooms')
      .then(res => res.json())
      .then(data => setRooms(Array.isArray(data) ? data : []))
      .catch(console.error);
  };

  useEffect(() => {
    fetchBookings();
    fetchRooms();
  }, []);

  const availableRooms = rooms.filter(r => r.status === 'available');

  const openCreate = (roomId?: string) => {
    if (availableRooms.length === 0) {
      showToast('No rooms are free right now. Mark a room as clean or add one on the Rooms page.', 'error');
      return;
    }
    setForm({ ...emptyForm(), roomId: availableRooms.find(r => r.id === roomId)?.id ?? availableRooms[0].id });
    setFormError('');
    setShowCreate(true);
  };

  // Arriving from a free room's "Create booking" opens the form with that room chosen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') && rooms.length > 0) {
      window.history.replaceState(null, '', window.location.pathname);
      openCreate(params.get('room') ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  const chosenRoom = rooms.find(r => r.id === form.roomId);
  const nights = nightsBetween(form.checkInDate, form.checkOutDate);
  const total = nights * Number(chosenRoom?.roomType.basePrice ?? 0);

  const handleCreateBooking = async () => {
    const guests = parseInt(form.numGuests) || 0;
    const sleeps = chosenRoom?.roomType.maxOccupancy;
    if (!form.roomId || !form.guestName.trim() || !form.checkInDate || !form.checkOutDate) {
      setFormError('Fill in the guest name, room and both dates.');
      return;
    }
    if (nights < 1) { setFormError('Check-out must be after check-in.'); return; }
    if (guests < 1) { setFormError('Enter how many guests are staying.'); return; }
    if (sleeps && guests > sleeps) { setFormError(`This room sleeps ${sleeps}. Choose a bigger room or fewer guests.`); return; }
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, guestName: form.guestName.trim(), guestEmail: form.guestEmail.trim() || undefined, numGuests: guests, source: 'staff' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(res.status < 500 && typeof data.error === 'string' ? data.error : 'Could not create the booking. Please try again.');
        return;
      }
      setShowCreate(false);
      fetchBookings();
      fetchRooms();
      showToast('Booking created', 'success');
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateBookingAction = async (booking: Booking, action: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        // Show the server's reason (for example "Only a pending booking can be confirmed").
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Could not ${action.replace('-', ' ')} this booking.`);
      }
      setSelectedId(null);
      setCancelling(null);
      fetchBookings();
      fetchRooms();
      showToast(`${booking.guest?.name || 'Booking'} ${ACTION_DONE[action] ?? action}`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong. Please try again.', 'error');
      fetchBookings();
    } finally {
      setSaving(false);
    }
  };

  const count = (s: string) => bookings.filter(b => s === 'all' || b.status === s).length;
  const arrivingToday = bookings.filter(b => (b.status === 'pending' || b.status === 'confirmed') && isToday(new Date(b.checkInDate))).length;
  const leavingToday = bookings.filter(b => b.status === 'checked_in' && isToday(new Date(b.checkOutDate))).length;

  const q = search.toLowerCase();
  const filteredBookings = bookings
    .filter(b => {
      const matchesSearch = !q ||
        b.guest?.name?.toLowerCase().includes(q) ||
        b.guest?.email?.toLowerCase().includes(q) ||
        b.room?.roomNumber?.includes(search);
      return matchesSearch && (statusFilter === 'all' || b.status === statusFilter);
    })
    // Bookings that still need handling come first, soonest arrival first; finished ones follow, newest first.
    .sort((a, b) => {
      const aActive = ACTIVE.includes(a.status), bActive = ACTIVE.includes(b.status);
      if (aActive !== bActive) return aActive ? -1 : 1;
      const diff = new Date(a.checkInDate).getTime() - new Date(b.checkInDate).getTime();
      return aActive ? diff : -diff;
    });
  const filtering = !!search || statusFilter !== 'all';

  const tabs = [
    { value: 'all', label: 'All', count: count('all') },
    ...BOOKING_STATUS_ORDER.map(s => ({ value: s, label: bookingStatus(s).label, count: count(s) })),
  ];

  const selected = bookings.find(b => b.id === selectedId) ?? null;
  const summary = bookings.length === 0
    ? 'Reservations and check-ins for your rooms.'
    : [`${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}`, arrivingToday && `${arrivingToday} arriving today`, leavingToday && `${leavingToday} leaving today`, count('pending') && `${count('pending')} to confirm`].filter(Boolean).join(' · ');

  const stay = (b: Booking) => {
    const n = differenceInCalendarDays(new Date(b.checkOutDate), new Date(b.checkInDate));
    return `${format(new Date(b.checkInDate), 'd MMM')} – ${format(new Date(b.checkOutDate), 'd MMM yyyy')} · ${n} ${n === 1 ? 'night' : 'nights'}`;
  };

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="section-title">Bookings</h1>
          <p className="section-sub">{summary}</p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          New booking
        </Button>
      </div>

      {stale && (
        <p role="status" className="mb-6 rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">
          Couldn&apos;t load the latest bookings. What you see may be out of date. Refresh the page to try again.
        </p>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <FilterTabs label="Show bookings that are" tabs={tabs} value={statusFilter} onChange={setStatusFilter} />
        <Input
          aria-label="Search bookings"
          placeholder="Search by guest, email or room…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:w-72"
        />
      </div>

      {loading ? (
        <LoadingState message="Loading bookings..." />
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          title={filtering ? 'No bookings match' : 'No bookings yet'}
          description={filtering ? 'Try a different search or show all bookings.' : 'Create a booking when a guest reserves a room, or wait for online requests to arrive here.'}
          actionLabel={!filtering ? 'Create first booking' : undefined}
          onAction={!filtering ? () => openCreate() : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {filteredBookings.map((booking) => {
            const status = bookingStatus(booking.status);
            const next = NEXT_ACTION[booking.status];
            const arrivesToday = (booking.status === 'pending' || booking.status === 'confirmed') && isToday(new Date(booking.checkInDate));
            const leavesToday = booking.status === 'checked_in' && isToday(new Date(booking.checkOutDate));
            return (
              <li key={booking.id} className="flex items-stretch bg-white border border-stone-200 rounded-xl shadow-sm hover:border-amber transition-colors">
                <button
                  type="button"
                  onClick={() => setSelectedId(booking.id)}
                  aria-label={`${booking.guest?.name || 'Guest'}, room ${booking.room?.roomNumber}, ${status.label}. Open details`}
                  className="flex-1 min-w-0 text-left p-4 md:p-5 grid gap-3 md:grid-cols-[1.3fr_1fr_1.3fr_auto] md:items-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink truncate">{booking.guest?.name || 'Guest'}</span>
                      <Badge variant={status.tone} dot>{status.label}</Badge>
                      {booking.source === 'online' && booking.status === 'pending' && <Badge variant="stone">Online request</Badge>}
                    </div>
                    <div className="text-sm text-ink-muted truncate mt-0.5">{realEmail(booking.guest?.email) || booking.guest?.phone || 'No email on file'}</div>
                  </div>
                  <div className="text-sm">
                    <div className="font-medium text-ink">Room {booking.room?.roomNumber}</div>
                    <div className="text-ink-muted">{booking.room?.roomType?.name || 'Standard'}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-ink">{stay(booking)}</div>
                    {(arrivesToday || leavesToday) && <div className="text-amber-deep font-medium">{arrivesToday ? 'Arrives today' : 'Leaves today'}</div>}
                  </div>
                  <div className="font-semibold text-ink md:text-right">{formatCurrency(Number(booking.totalAmount))}</div>
                </button>
                {next && (
                  <div className="flex items-center pr-4 md:pr-5">
                    <Button size="sm" variant={booking.status === 'checked_in' ? 'ghost' : 'primary'} disabled={saving} onClick={() => updateBookingAction(booking, next.action)}>
                      {next.label}<span className="sr-only"> {booking.guest?.name}</span>
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Booking details */}
      <Dialog open={!!selected} onClose={() => setSelectedId(null)} labelledBy="booking-title" variant="drawer">
        {selected && (() => {
          const status = bookingStatus(selected.status);
          const next = NEXT_ACTION[selected.status];
          const rows: [string, string][] = [
            ...(realEmail(selected.guest?.email) ? [['Email', realEmail(selected.guest.email)] as [string, string]] : []),
            ...(selected.guest?.phone ? [['Phone', selected.guest.phone] as [string, string]] : []),
            ['Room', `Room ${selected.room?.roomNumber} · ${selected.room?.roomType?.name || 'Standard'}`],
            ['Check-in', format(new Date(selected.checkInDate), 'EEE d MMM yyyy, h:mm a')],
            ['Check-out', format(new Date(selected.checkOutDate), 'EEE d MMM yyyy, h:mm a')],
            ['Guests', String(selected.numGuests)],
            ['Total', formatCurrency(Number(selected.totalAmount))],
            ['Booked via', SOURCE_LABEL[selected.source] ?? selected.source],
            ...(selected.specialRequests ? [['Requests', selected.specialRequests] as [string, string]] : []),
          ];
          return (
            <>
              <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-stone-200">
                <div className="min-w-0">
                  <h2 id="booking-title" className="text-[1.375rem] font-semibold text-ink truncate">{selected.guest?.name || 'Guest'}</h2>
                  <div className="mt-2"><Badge variant={status.tone}>{status.label}</Badge></div>
                </div>
                <button onClick={() => setSelectedId(null)} aria-label="Close" className="p-2 rounded-lg text-ink-muted hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"><X className="w-5 h-5" aria-hidden="true" /></button>
              </header>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <dl className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-3 text-sm">
                  {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-ink-muted">{k}</dt><dd className="font-medium text-ink break-words">{v}</dd></div>))}
                </dl>
              </div>
              {(next || selected.status === 'pending' || selected.status === 'confirmed') && (
                <footer className="grid gap-2.5 px-6 py-4 border-t border-stone-200">
                  {next && <Button className="w-full h-[46px]" disabled={saving} onClick={() => updateBookingAction(selected, next.action)}>{next.label}</Button>}
                  {(selected.status === 'pending' || selected.status === 'confirmed') && (
                    <Button variant="ghost" className="w-full h-[46px] text-terra hover:bg-terra-pale" onClick={() => { setSelectedId(null); setCancelling(selected); }}>
                      {selected.status === 'pending' ? 'Decline request' : 'Cancel booking'}
                    </Button>
                  )}
                </footer>
              )}
            </>
          );
        })()}
      </Dialog>

      {/* New booking */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} labelledBy="new-booking-title" dismissible={!saving} className="p-6 md:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 id="new-booking-title" className="font-serif text-2xl font-bold">New booking</h2>
          <button onClick={() => setShowCreate(false)} aria-label="Close" className="text-ink-muted hover:text-ink rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"><X className="w-5 h-5" aria-hidden="true" /></button>
        </div>

        <div className="space-y-4">
          <Input label="Guest name" placeholder="Guest full name" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
          <Input label="Guest email (optional)" type="email" placeholder="guest@email.com" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} />
          <Input label="Guest phone (optional)" type="tel" placeholder="+91 98765 43210" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <DatePicker
              label="Check-in"
              required
              min={todayYmd()}
              value={form.checkInDate}
              onChange={(v) => setForm({ ...form, checkInDate: v, checkOutDate: form.checkOutDate > v ? form.checkOutDate : dayAfter(v) ?? '' })} // a check-out on or before the new check-in moves to the next day
            />
            <DatePicker label="Check-out" required min={dayAfter(form.checkInDate)} value={form.checkOutDate} onChange={(v) => setForm({ ...form, checkOutDate: v })} />
          </div>
          <Select
            label="Room"
            value={form.roomId}
            onChange={(e) => setForm({ ...form, roomId: e.target.value })}
            options={availableRooms.map(r => ({ value: r.id, label: `Room ${r.roomNumber} · ${r.roomType.name} · ${formatCurrency(Number(r.roomType.basePrice))}/night` }))}
          />
          <Input label="Number of guests" type="number" inputMode="numeric" min={1} value={form.numGuests} onChange={(e) => setForm({ ...form, numGuests: e.target.value })} />
          <Input label="Special requests (optional)" placeholder="Anything the hotel should know" value={form.specialRequests} onChange={(e) => setForm({ ...form, specialRequests: e.target.value })} />

          {nights > 0 && chosenRoom && (
            <div className="flex items-center justify-between rounded-xl bg-stone-50 border border-stone-200 px-4 py-3 text-sm">
              <span className="text-ink-muted">{nights} {nights === 1 ? 'night' : 'nights'} × {formatCurrency(Number(chosenRoom.roomType.basePrice))}</span>
              <span className="font-semibold text-ink">{formatCurrency(total)}</span>
            </div>
          )}

          {formError && <p role="alert" className="rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{formError}</p>}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button>
            <Button className="flex-1" onClick={handleCreateBooking} disabled={saving}>{saving ? 'Creating…' : 'Create booking'}</Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel / decline */}
      <Dialog open={!!cancelling} onClose={() => setCancelling(null)} labelledBy="cancel-title" dismissible={!saving} className="p-8 max-w-md w-full">
        {cancelling && (
          <>
            <h2 id="cancel-title" className="text-2xl font-bold text-ink">{cancelling.status === 'pending' ? 'Decline this request?' : 'Cancel this booking?'}</h2>
            <p className="text-ink-muted mt-2">
              {cancelling.guest?.name}, room {cancelling.room?.roomNumber}, {stay(cancelling)}. The room is released for other guests.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setCancelling(null)} disabled={saving}>Keep booking</Button>
              <Button variant="terra" className="flex-1" onClick={() => updateBookingAction(cancelling, 'cancel')} disabled={saving}>
                {saving ? 'Cancelling…' : cancelling.status === 'pending' ? 'Decline request' : 'Cancel booking'}
              </Button>
            </div>
          </>
        )}
      </Dialog>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            role={toast.type === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-[env(safe-area-inset-top)] left-4 right-4 md:left-auto md:right-8 md:top-8 z-[200] px-6 py-4 rounded-xl shadow-2xl text-white ${toast.type === 'success' ? 'bg-sage' : 'bg-terra'}`}
          >
            <span className="font-medium text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
