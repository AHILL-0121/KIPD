'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Plus, Bed, Hotel as HotelIcon, X, User, Check, Wrench, Sparkles, Ban, type LucideIcon } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { ROOM_STATUS_ORDER, roomStatus, type RoomStatus } from '@/lib/room-status';
import { motion, AnimatePresence } from 'framer-motion';

interface RoomType {
  id: string;
  name: string;
  basePrice: string;
  maxOccupancy: number;
  amenities: string[];
  description: string;
}

interface Room {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  roomType: RoomType;
  floor: number;
  status: RoomStatus;
}

/** The part of a booking this page needs: who is in a room, and until when. */
interface Stay {
  id: string;
  roomId: string;
  status: string;
  checkOutDate: string;
  guest?: { name: string };
}

type RoomDialog = { mode: 'add' } | { mode: 'edit'; room: Room } | null;
type Toast = { message: string; type: 'success' | 'error'; undo?: () => void };

const EMPTY_ROOM = { roomNumber: '', roomTypeId: '', floor: '1' };
const EMPTY_TYPE = { name: '', basePrice: '', maxOccupancy: '2', description: '' };

const STATUS_ICON: Record<RoomStatus, LucideIcon> = { available: Check, occupied: User, cleaning: Sparkles, maintenance: Wrench, blocked: Ban };
const IDLE_NOTE: Record<RoomStatus, string> = {
  available: 'Ready to sell',
  occupied: 'Guest in the room',
  cleaning: 'Housekeeping in progress',
  maintenance: 'Needs repair before it can be sold',
  blocked: 'Not for sale',
};

/** The server's own message when it gave one ("This item is still in use…"), otherwise ours. */
async function failure(res: Response, fallback: string) {
  try {
    const body = await res.json();
    if (typeof body?.error === 'string' && res.status < 500) return body.error;
  } catch { /* not JSON */ }
  return fallback;
}

const floorName = (f: number) => (f === 0 ? 'Ground floor' : `Floor ${f}`);

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [noTenant, setNoTenant] = useState(false);
  const [stale, setStale] = useState(false);

  // Dialogs
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roomDialog, setRoomDialog] = useState<RoomDialog>(null);
  const [showRoomTypes, setShowRoomTypes] = useState(false);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Form states
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);
  const [roomTypeForm, setRoomTypeForm] = useState(EMPTY_TYPE);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (message: string, type: 'success' | 'error', undo?: () => void) => {
    setToast({ message, type, undo });
    setTimeout(() => setToast(null), undo ? 7000 : 4000);
  };

  const fetchRooms = () => {
    fetch('/api/rooms')
      .then(res => {
        if (res.status === 401) throw new Error('NO_TENANT');
        if (!res.ok) throw new Error('Failed to fetch rooms');
        return res.json();
      })
      .then(data => { setRooms(Array.isArray(data) ? data : []); setStale(false); })
      .catch(err => {
        if (err.message === 'NO_TENANT') setNoTenant(true);
        else { console.error(err); setStale(true); } // keep what is on screen, but say it may be out of date
      })
      .finally(() => setLoading(false));
  };

  const fetchRoomTypes = () => {
    fetch('/api/room-types')
      .then(res => res.json())
      .then(data => setRoomTypes(Array.isArray(data) ? data : []))
      .catch(console.error);
  };

  // Who is in which room. Roles that cannot see bookings just get rooms without guest names.
  const fetchStays = () => {
    fetch('/api/bookings')
      .then(res => (res.ok ? res.json() : []))
      .then(data => setStays(Array.isArray(data) ? data : []))
      .catch(() => setStays([]));
  };

  useEffect(() => {
    fetchRooms();
    fetchRoomTypes();
    fetchStays();
  }, []);

  const stayFor = (room: Room) => (room.status === 'occupied' ? stays.find(s => s.roomId === room.id && s.status === 'checked_in') : undefined);

  const openAddRoom = () => {
    if (roomTypes.length === 0) {
      openRoomTypes();
      setFormError('Add a room type first (for example Deluxe), then you can add rooms.');
      return;
    }
    setRoomForm({ ...EMPTY_ROOM, roomTypeId: roomTypes[0].id });
    setFormError('');
    setRoomDialog({ mode: 'add' });
  };

  const openEditRoom = (room: Room) => {
    setSelectedId(null);
    setRoomForm({ roomNumber: room.roomNumber, roomTypeId: room.roomTypeId, floor: String(room.floor || 1) });
    setFormError('');
    setRoomDialog({ mode: 'edit', room });
  };

  const openRoomTypes = () => {
    setRoomTypeForm(EMPTY_TYPE);
    setFormError('');
    setShowRoomTypes(true);
  };

  const handleSaveRoom = async () => {
    if (!roomDialog) return;
    if (!roomForm.roomNumber.trim() || !roomForm.roomTypeId) {
      setFormError('Enter a room number and choose a room type.');
      return;
    }
    const editing = roomDialog.mode === 'edit';
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/rooms', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(roomDialog.mode === 'edit' ? { roomId: roomDialog.room.id } : { status: 'available' }),
          roomNumber: roomForm.roomNumber.trim(),
          roomTypeId: roomForm.roomTypeId,
          floor: parseInt(roomForm.floor) || 1,
        }),
      });
      if (!res.ok) { setFormError(await failure(res, editing ? 'Could not save the changes. Please try again.' : 'Could not add the room. Please try again.')); return; }
      setRoomDialog(null);
      fetchRooms();
      showToast(editing ? 'Room updated' : 'Room added', 'success');
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRoomType = async () => {
    const price = parseFloat(roomTypeForm.basePrice);
    if (!roomTypeForm.name.trim() || !(price > 0)) {
      setFormError('Enter a name and a price per night.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/room-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomTypeForm.name.trim(),
          basePrice: price,
          maxOccupancy: parseInt(roomTypeForm.maxOccupancy) || 2,
          description: roomTypeForm.description,
        }),
      });
      if (!res.ok) { setFormError(await failure(res, 'Could not add the room type. Please try again.')); return; }
      setRoomTypeForm(EMPTY_TYPE);
      fetchRoomTypes();
      showToast('Room type added', 'success');
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  /** Changes a room's status straight away, puts it back if the server says no, and offers Undo. */
  const changeStatus = async (room: Room, next: RoomStatus, message: string) => {
    const before = room.status;
    const apply = async (to: RoomStatus) => {
      setRooms(rs => rs.map(r => (r.id === room.id ? { ...r, status: to } : r)));
      const res = await fetch('/api/rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room.id, status: to }),
      });
      if (!res.ok) throw new Error('Failed');
    };
    setSelectedId(null);
    try {
      await apply(next);
      showToast(message, 'success', () => { apply(before).catch(() => { fetchRooms(); showToast(`Could not undo for room ${room.roomNumber}.`, 'error'); }); setToast(null); });
    } catch {
      setRooms(rs => rs.map(r => (r.id === room.id ? { ...r, status: before } : r)));
      showToast(`Could not change room ${room.roomNumber}. Please try again.`, 'error');
    }
  };

  /** Checking out goes through the booking, which also moves the room to cleaning. */
  const checkOut = async (room: Room) => {
    const stay = stayFor(room);
    if (!stay) { changeStatus(room, 'cleaning', `Room ${room.roomNumber} is being cleaned.`); return; }
    setSelectedId(null);
    try {
      const res = await fetch(`/api/bookings/${stay.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-out' }),
      });
      if (!res.ok) throw new Error(await failure(res, `Could not check out room ${room.roomNumber}. Please try again.`));
      fetchRooms();
      fetchStays();
      showToast(`Room ${room.roomNumber} checked out. It now needs cleaning.`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not check out. Please try again.', 'error');
    }
  };

  const handleDeleteRoom = async () => {
    if (!deleting) return;
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`/api/rooms?id=${deleting.id}`, { method: 'DELETE' });
      if (!res.ok) { setFormError(await failure(res, 'Could not delete the room. Please try again.')); return; }
      setDeleting(null);
      fetchRooms();
      showToast('Room deleted', 'success');
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;

  if (noTenant) {
    return (
      <div className="p-4 md:p-8 overflow-x-hidden">
        <EmptyState
          icon={HotelIcon}
          title="No property linked yet"
          message="Your account isn't linked to a property, so there are no rooms to show. Ask your administrator to add you."
          action="/admin/tenants"
          actionLabel="Open admin panel"
        />
      </div>
    );
  }

  const count = (s: string) => rooms.filter(r => s === 'all' || r.status === s).length;
  const filteredRooms = rooms.filter(r => {
    const matchesSearch = r.roomNumber.includes(search) || r.roomType?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const filtering = !!search || statusFilter !== 'all';
  const floors = Array.from(new Set(filteredRooms.map(r => r.floor || 0))).sort((a, b) => a - b);

  const tabs = [
    { value: 'all', label: 'All', count: count('all') },
    ...ROOM_STATUS_ORDER
      .filter(s => s !== 'blocked' || count('blocked') > 0) // Blocked only gets a tab once something is blocked
      .map(s => ({ value: s, label: roomStatus(s).label, count: count(s) })),
  ];

  const roomTypeOptions = roomTypes.map(rt => ({ value: rt.id, label: `${rt.name} - ${formatCurrency(Number(rt.basePrice))}/night` }));
  const selected = rooms.find(r => r.id === selectedId) ?? null;

  const actionsFor = (room: Room): { label: string; primary?: boolean; run: () => void }[] => {
    const n = room.roomNumber;
    switch (room.status) {
      case 'occupied': return [{ label: 'Check out guest', primary: true, run: () => checkOut(room) }];
      case 'available': return [
        { label: 'Block room', run: () => changeStatus(room, 'blocked', `Room ${n} blocked.`) },
        { label: 'Mark out of order', run: () => changeStatus(room, 'maintenance', `Room ${n} marked out of order.`) },
      ];
      case 'cleaning': return [
        { label: 'Mark as clean', primary: true, run: () => changeStatus(room, 'available', `Room ${n} marked clean.`) },
        { label: 'Mark out of order', run: () => changeStatus(room, 'maintenance', `Room ${n} marked out of order.`) },
      ];
      case 'maintenance': return [{ label: 'Mark as fixed', primary: true, run: () => changeStatus(room, 'available', `Room ${n} marked as fixed.`) }];
      default: return [{ label: 'Unblock room', primary: true, run: () => changeStatus(room, 'available', `Room ${n} is open again.`) }];
    }
  };

  const summary = `${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'} · ${count('occupied')} occupied · ${count('available')} available`;
  const stayOf = selected ? stayFor(selected) : undefined;

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="section-title">Rooms</h1>
          <p className="section-sub">{rooms.length === 0 ? 'See which rooms are free, and keep their details up to date.' : summary}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" onClick={openRoomTypes}>
            <Bed className="w-4 h-4" aria-hidden="true" />
            Room types
          </Button>
          <Button variant="ghost" onClick={openAddRoom}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add room
          </Button>
          <Link href="/dashboard/bookings?new=1" className="inline-flex items-center justify-center gap-2 font-medium rounded-lg px-6 py-3 bg-amber text-white hover:bg-amber-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber">
            <Plus className="w-4 h-4" aria-hidden="true" />
            New booking
          </Link>
        </div>
      </div>

      {stale && (
        <p role="status" className="mb-6 rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">
          Couldn&apos;t load the latest rooms. What you see may be out of date. Refresh the page to try again.
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <FilterTabs label="Show rooms that are" tabs={tabs} value={statusFilter} onChange={setStatusFilter} />
        <Input
          aria-label="Search rooms"
          placeholder="Search by room number or type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:w-72"
        />
      </div>

      {filteredRooms.length === 0 ? (
        <EmptyState
          title={filtering ? 'No rooms match' : 'No rooms yet'}
          description={
            filtering
              ? 'Try a different search or show all rooms.'
              : roomTypes.length === 0
                ? 'Start with a room type (like Deluxe, with its price), then add the rooms of that type.'
                : 'Add your first room to start tracking which are free.'
          }
          actionLabel={!filtering ? (roomTypes.length === 0 ? 'Add a room type' : 'Add first room') : undefined}
          onAction={!filtering ? (roomTypes.length === 0 ? openRoomTypes : openAddRoom) : undefined}
        />
      ) : (
        floors.map(floor => {
          const onFloor = filteredRooms.filter(r => (r.floor || 0) === floor);
          return (
            <section key={floor} aria-labelledby={`floor-${floor}`} className="mb-8">
              <h2 id={`floor-${floor}`} className="flex items-baseline gap-2.5 text-base font-semibold text-ink mb-3">
                {floorName(floor)}
                <span className="text-sm font-normal text-ink-muted">{onFloor.length} {onFloor.length === 1 ? 'room' : 'rooms'}</span>
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                {onFloor.map(room => {
                  const status = roomStatus(room.status);
                  const Icon = STATUS_ICON[room.status] ?? Check;
                  const stay = stayFor(room);
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setSelectedId(room.id)}
                      aria-label={`Room ${room.roomNumber}, ${status.label}. Open details`}
                      className="flex flex-col gap-2.5 text-left min-h-[122px] p-4 bg-white border border-stone-200 rounded-xl shadow-sm transition-colors hover:border-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[1.375rem] font-semibold leading-tight text-ink">{room.roomNumber}</span>
                        <Badge variant={status.tone}><Icon className="w-3.5 h-3.5" aria-hidden="true" />{status.label}</Badge>
                      </div>
                      <span className="text-sm text-ink-muted">{room.roomType?.name || 'Unknown'} · {formatCurrency(Number(room.roomType?.basePrice || 0))} a night</span>
                      <span className="mt-auto pt-2.5 border-t border-dashed border-stone-200 text-sm text-ink-soft">
                        {stay?.guest?.name ? `${stay.guest.name} · out ${format(new Date(stay.checkOutDate), 'EEE d MMM')}` : IDLE_NOTE[room.status]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {/* Room details */}
      <Dialog open={!!selected} onClose={() => setSelectedId(null)} labelledBy="drawer-title" variant="drawer">
        {selected && (
          <>
            <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-stone-200">
              <div>
                <h2 id="drawer-title" className="text-[1.375rem] font-semibold text-ink">Room {selected.roomNumber}</h2>
                <div className="mt-2">
                  <Badge variant={roomStatus(selected.status).tone}>{roomStatus(selected.status).label}</Badge>
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} aria-label="Close" className="p-2 rounded-lg text-ink-muted hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"><X className="w-5 h-5" aria-hidden="true" /></button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-ink-muted">Type</dt><dd className="font-medium text-ink">{selected.roomType?.name || 'Unknown'}</dd>
                <dt className="text-ink-muted">Floor</dt><dd className="font-medium text-ink">{selected.floor || 1}</dd>
                <dt className="text-ink-muted">Rate</dt><dd className="font-medium text-ink">{formatCurrency(Number(selected.roomType?.basePrice || 0))} a night</dd>
                {selected.roomType?.maxOccupancy ? (<><dt className="text-ink-muted">Sleeps</dt><dd className="font-medium text-ink">{selected.roomType.maxOccupancy}</dd></>) : null}
                {stayOf?.guest?.name && (<><dt className="text-ink-muted">Guest</dt><dd className="font-medium text-ink">{stayOf.guest.name}</dd></>)}
                {stayOf && (<><dt className="text-ink-muted">Check-out</dt><dd className="font-medium text-ink">{format(new Date(stayOf.checkOutDate), 'EEE d MMM yyyy')}</dd></>)}
              </dl>
            </div>

            <footer className="grid gap-2.5 px-6 py-4 border-t border-stone-200">
              {selected.status === 'available' && (
                <Link href={`/dashboard/bookings?new=1&room=${selected.id}`} className="inline-flex items-center justify-center h-[46px] rounded-lg bg-amber text-white font-medium hover:bg-amber-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber">
                  Create booking
                </Link>
              )}
              {actionsFor(selected).map(a => (
                <Button key={a.label} variant={a.primary ? 'primary' : 'ghost'} className="w-full h-[46px]" onClick={a.run}>{a.label}</Button>
              ))}
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => openEditRoom(selected)}>
                  Edit details<span className="sr-only"> for room {selected.roomNumber}</span>
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 text-terra hover:bg-terra-pale" onClick={() => { setSelectedId(null); setFormError(''); setDeleting(selected); }}>
                  Delete room<span className="sr-only"> {selected.roomNumber}</span>
                </Button>
              </div>
            </footer>
          </>
        )}
      </Dialog>

      {/* Add / Edit Room */}
      <Dialog open={!!roomDialog} onClose={() => setRoomDialog(null)} labelledBy="room-title" dismissible={!saving} className="p-8 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 id="room-title" className="font-serif text-2xl font-bold">{roomDialog?.mode === 'edit' ? `Edit room ${roomDialog.room.roomNumber}` : 'Add room'}</h2>
          <button onClick={() => setRoomDialog(null)} aria-label="Close" className="text-ink-muted hover:text-ink rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"><X className="w-5 h-5" aria-hidden="true" /></button>
        </div>

        <div className="space-y-4">
          <Input
            label="Room number"
            placeholder="101"
            value={roomForm.roomNumber}
            onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })}
          />
          <Select
            label="Room type"
            value={roomForm.roomTypeId}
            onChange={(e) => setRoomForm({ ...roomForm, roomTypeId: e.target.value })}
            options={roomTypeOptions}
          />
          <Input
            label="Floor"
            type="number"
            inputMode="numeric"
            placeholder="1"
            value={roomForm.floor}
            onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
          />

          {formError && <p role="alert" className="rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{formError}</p>}

          <div className="flex gap-3 pt-4">
            <Button variant="ghost" className="flex-1" onClick={() => setRoomDialog(null)} disabled={saving}>Cancel</Button>
            <Button className="flex-1" onClick={handleSaveRoom} disabled={saving}>
              {saving ? 'Saving…' : roomDialog?.mode === 'edit' ? 'Save changes' : 'Add room'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Room types */}
      <Dialog open={showRoomTypes} onClose={() => setShowRoomTypes(false)} labelledBy="types-title" dismissible={!saving} className="p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 id="types-title" className="font-serif text-2xl font-bold">Room types</h2>
          <button onClick={() => setShowRoomTypes(false)} aria-label="Close" className="text-ink-muted hover:text-ink rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"><X className="w-5 h-5" aria-hidden="true" /></button>
        </div>

        <div className="space-y-4">
          {roomTypes.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-ink mb-2">Your room types</h3>
              <ul className="space-y-2 max-h-32 overflow-y-auto">
                {roomTypes.map(rt => (
                  <li key={rt.id} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-sm">
                    <span className="font-medium">{rt.name}</span>
                    <span className="text-ink-muted">{formatCurrency(Number(rt.basePrice))}/night</span>
                  </li>
                ))}
              </ul>
              <hr className="mt-4" />
            </div>
          )}

          <h3 className="text-sm font-medium text-ink">Add a room type</h3>
          <Input
            label="Name"
            placeholder="Deluxe Suite"
            value={roomTypeForm.name}
            onChange={(e) => setRoomTypeForm({ ...roomTypeForm, name: e.target.value })}
          />
          <Input
            label="Price per night (₹)"
            type="number"
            inputMode="decimal"
            placeholder="3000"
            value={roomTypeForm.basePrice}
            onChange={(e) => setRoomTypeForm({ ...roomTypeForm, basePrice: e.target.value })}
          />
          <Input
            label="Most guests"
            type="number"
            inputMode="numeric"
            placeholder="2"
            value={roomTypeForm.maxOccupancy}
            onChange={(e) => setRoomTypeForm({ ...roomTypeForm, maxOccupancy: e.target.value })}
          />
          <Input
            label="Description (optional)"
            placeholder="A quiet room with a city view"
            value={roomTypeForm.description}
            onChange={(e) => setRoomTypeForm({ ...roomTypeForm, description: e.target.value })}
          />

          {formError && <p role="alert" className="rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{formError}</p>}

          <div className="flex gap-3 pt-4">
            <Button variant="ghost" className="flex-1" onClick={() => setShowRoomTypes(false)} disabled={saving}>Close</Button>
            <Button className="flex-1" onClick={handleCreateRoomType} disabled={saving}>
              {saving ? 'Adding…' : 'Add room type'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete a room */}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} labelledBy="delete-title" dismissible={!saving} className="p-8 max-w-md w-full">
        {deleting && (
          <>
            <h2 id="delete-title" className="text-2xl font-bold text-ink">Delete room {deleting.roomNumber}?</h2>
            <p className="text-ink-muted mt-2">This removes the room from your list. It can&apos;t be undone.</p>
            {formError && <p role="alert" className="mt-4 rounded-lg bg-terra-pale px-4 py-3 text-sm text-terra">{formError}</p>}
            <div className="mt-6 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setDeleting(null)} disabled={saving}>Keep room</Button>
              <Button variant="terra" className="flex-1" onClick={handleDeleteRoom} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete room'}
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
            className={`fixed top-[env(safe-area-inset-top)] left-4 right-4 md:left-auto md:right-8 md:top-8 z-[200] px-6 py-4 rounded-xl shadow-2xl text-white flex items-center gap-4 ${toast.type === 'success' ? 'bg-sage' : 'bg-terra'}`}
          >
            <span className="font-medium text-sm">{toast.message}</span>
            {toast.undo && <button onClick={toast.undo} className="ml-auto text-sm font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white rounded">Undo</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
