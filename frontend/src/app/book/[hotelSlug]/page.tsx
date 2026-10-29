'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, format } from 'date-fns';
import { Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { KipdMascot } from '@/components/mascot/KipdMascot';
import { formatCurrency } from '@/lib/currency';

interface RoomType { id: string; name: string; description: string; basePrice: number; maxOccupancy: number; amenities: string[]; available: boolean | null }
interface Result { reference: string; roomType: string; checkIn: string; checkOut: string; nights: number; total: number }

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

export default function BookingPage({ params }: { params: { hotelSlug: string } }) {
  const slug = params.hotelSlug;
  const [step, setStep] = useState<'select' | 'details' | 'done'>('select');
  const [hotelName, setHotelName] = useState('');
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState(ymd(new Date()));
  const [checkOut, setCheckOut] = useState(ymd(addDays(new Date(), 1)));
  const [guests, setGuests] = useState(2);
  const [selected, setSelected] = useState<string | null>(null);
  const [info, setInfo] = useState({ name: '', email: '', phone: '', requests: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  const datesOk = checkOut > checkIn;
  const nights = datesOk ? Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000) : 0;

  // Loads the room types, and re-checks availability whenever the dates change.
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const q = datesOk ? `?checkIn=${checkIn}&checkOut=${checkOut}` : '';
      const res = await fetch(`/api/public/hotel/${slug}${q}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 404 ? 'Online booking is not available for this hotel.' : data.error || 'Could not load the rooms.');
      setHotelName(data.hotel.name);
      setRoomTypes(data.roomTypes);
      setSelected((s) => (data.roomTypes.find((r: RoomType) => r.id === s && r.available !== false) ? s : null));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the rooms.');
    }
  }, [slug, checkIn, checkOut, datesOk]);
  useEffect(() => { load(); }, [load]);

  const room = roomTypes.find((r) => r.id === selected) ?? null;
  const detailsOk = info.name.trim() && /^\S+@\S+\.\S+$/.test(info.email.trim());

  async function submit() {
    if (!room) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug, roomTypeId: room.id, checkIn, checkOut, guests,
          name: info.name.trim(), email: info.email.trim(), phone: info.phone.trim() || undefined,
          requests: info.requests.trim() || undefined, website: honeypot.current?.value ?? '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { if (res.status === 409) load(); throw new Error(data.error || 'We could not send your request. Please try again.'); }
      setResult(data); setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not send your request.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError && roomTypes.length === 0) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6 text-center">
        <div className="max-w-sm"><KipdMascot size="lg" animated={false} /><p className="mt-6 text-lg text-ink" role="alert">{loadError}</p><Button className="mt-6" onClick={load}>Try again</Button></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-amber-pale">
      <header className="bg-white border-b border-stone-200 py-5">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-4">
          <KipdMascot size="sm" animated={false} />
          <div><h1 className="font-serif text-2xl font-bold text-ink">{hotelName || 'Book your stay'}</h1><p className="text-sm text-ink-muted">Book your stay</p></div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {step === 'select' && (
          <>
            <Card hover={false} className="mb-8 p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Input type="date" label="Check-in" min={ymd(new Date())} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                <Input type="date" label="Check-out" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                <Input type="number" label="Guests" min={1} max={20} value={guests} onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              {!datesOk && <p className="text-sm text-terra mt-3" role="alert">Check-out must be after check-in.</p>}
              {datesOk && <p className="text-sm text-ink-muted mt-3">{nights} night{nights === 1 ? '' : 's'}</p>}
            </Card>

            <h2 className="font-serif text-2xl font-bold text-ink mb-4">Rooms</h2>
            {roomTypes.length === 0 && <p className="text-ink-muted">No rooms are open for online booking right now. Please contact the hotel.</p>}
            <div className="grid md:grid-cols-2 gap-5">
              {roomTypes.map((r) => {
                const unavailable = r.available === false, tooSmall = guests > r.maxOccupancy, blocked = unavailable || tooSmall;
                return (
                  <button key={r.id} disabled={blocked || !datesOk} onClick={() => setSelected(r.id)} aria-pressed={selected === r.id}
                    className={`text-left rounded-2xl bg-white p-5 border-2 transition ${selected === r.id ? 'border-amber ring-2 ring-amber' : 'border-stone-200'} ${blocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-amber'}`}>
                    <div className="flex justify-between gap-3">
                      <div><h3 className="font-serif text-xl font-bold text-ink">{r.name}</h3>{r.description && <p className="text-ink-muted mt-1">{r.description}</p>}</div>
                      {selected === r.id && <span className="w-8 h-8 bg-amber rounded-full flex items-center justify-center flex-none"><Check className="w-5 h-5 text-white" /></span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-ink-muted mt-3"><Users className="w-4 h-4" /> Up to {r.maxOccupancy} guests</div>
                    {r.amenities.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{r.amenities.map((a) => <span key={a} className="px-3 py-1 bg-stone-100 rounded-full text-xs text-ink-soft">{a}</span>)}</div>}
                    <div className="mt-4 pt-3 border-t border-stone-200 flex items-center justify-between">
                      <span className="text-sm text-ink-muted">{unavailable ? 'Not available for these dates' : tooSmall ? `Sleeps up to ${r.maxOccupancy}` : 'per night'}</span>
                      <span className="text-2xl font-bold text-ink">{formatCurrency(r.basePrice)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {room && datesOk && (
              <div className="mt-8 text-center">
                <p className="text-ink-muted mb-3">{room.name} · {nights} night{nights === 1 ? '' : 's'} · <strong className="text-ink">{formatCurrency(room.basePrice * nights)}</strong></p>
                <Button size="lg" variant="terra" onClick={() => { setError(null); setStep('details'); }}>Continue →</Button>
              </div>
            )}
          </>
        )}

        {step === 'details' && room && (
          <div className="max-w-xl mx-auto">
            <h2 className="font-serif text-2xl font-bold text-ink mb-4">Your details</h2>
            <Card hover={false} className="p-6 space-y-4">
              <Input label="Full name" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} autoComplete="name" />
              <Input label="Email" type="email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} autoComplete="email" />
              <Input label="Phone (optional)" type="tel" value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} autoComplete="tel" />
              <label className="block">
                <span className="text-sm font-medium text-ink">Special requests (optional)</span>
                <textarea value={info.requests} maxLength={500} rows={3} onChange={(e) => setInfo({ ...info, requests: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-300 p-3 text-ink" />
              </label>
              <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

              <div className="rounded-xl bg-stone-50 p-4 text-sm text-ink-soft">
                <div className="flex justify-between"><span>{room.name}, {nights} night{nights === 1 ? '' : 's'}</span><strong className="text-ink">{formatCurrency(room.basePrice * nights)}</strong></div>
                <div className="text-ink-muted mt-1">{format(new Date(checkIn), 'EEE d MMM')} to {format(new Date(checkOut), 'EEE d MMM yyyy')} · {guests} guest{guests === 1 ? '' : 's'}</div>
                <div className="text-ink-muted mt-2">This sends a booking request. The hotel confirms it, and you pay at the hotel.</div>
              </div>

              {error && <p className="text-sm text-terra bg-terra-pale rounded-lg p-3" role="alert">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="ghost" className="flex-1" onClick={() => setStep('select')} disabled={submitting}>← Back</Button>
                <Button variant="terra" className="flex-1" onClick={submit} disabled={submitting || !detailsOk}>{submitting ? 'Sending…' : 'Send request'}</Button>
              </div>
            </Card>
          </div>
        )}

        {step === 'done' && result && (
          <div className="max-w-xl mx-auto text-center">
            <div className="mb-6"><KipdMascot size="lg" /></div>
            <h2 className="font-serif text-3xl font-bold text-ink mb-3">Request received</h2>
            <p className="text-ink-muted mb-6">The hotel will review your request and contact you to confirm. Nothing is charged online.</p>
            <Card hover={false} className="p-6 text-left space-y-3">
              {[['Reference', result.reference], ['Room', result.roomType], ['Check-in', format(new Date(result.checkIn), 'EEE d MMM yyyy') + ' from 2:00 pm'], ['Check-out', format(new Date(result.checkOut), 'EEE d MMM yyyy') + ' by 11:00 am'], ['Total', formatCurrency(result.total)]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><span className="text-ink-muted">{k}</span><span className="text-ink font-medium text-right">{v}</span></div>
              ))}
            </Card>
            <p className="text-sm text-ink-muted mt-4">Keep your reference: <strong className="text-ink">{result.reference}</strong></p>
          </div>
        )}
      </main>
    </div>
  );
}
