'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Plus, Bed, Hotel as HotelIcon } from 'lucide-react';
import { ROOM_STATUS_ORDER, roomStatus, type RoomStatus } from '@/lib/room-status';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@/hooks/use-query';
import { useAppMessages } from '@/components/ui/i18n-provider';

import {
  Room,
  RoomType,
  Stay,
  RoomDialog,
  Toast,
  EMPTY_ROOM,
  EMPTY_TYPE,
  failure,
} from '@/components/rooms/types';
import { FloorSection } from '@/components/rooms/floor-section';
import { RoomDetailDrawer } from '@/components/rooms/room-detail-drawer';
import { AddRoomModal } from '@/components/rooms/add-room-modal';
import { RoomTypesModal } from '@/components/rooms/room-types-modal';
import { DeleteRoomModal } from '@/components/rooms/delete-room-modal';

export default function RoomsPage() {
  const m = useAppMessages();
  const { data: rawRooms, isLoading: loading, error: roomsError, refetch: refetchRooms } = useQuery<Room[]>('/api/rooms');
  const { data: rawRoomTypes, refetch: refetchRoomTypes } = useQuery<RoomType[]>('/api/room-types');
  const { data: rawStays, refetch: refetchStays } = useQuery<Stay[]>('/api/bookings');

  const [rooms, setRooms] = useState<Room[]>([]);
  useEffect(() => {
    if (rawRooms) setRooms(rawRooms);
  }, [rawRooms]);

  const roomTypes = rawRoomTypes ?? [];
  const stays = rawStays ?? [];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const stayFor = (room: Room) =>
    room.status === 'occupied' ? stays.find(s => s.roomId === room.id && s.status === 'checked_in') : undefined;

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
      if (!res.ok) {
        setFormError(await failure(res, editing ? 'Could not save the changes. Please try again.' : 'Could not add the room. Please try again.'));
        return;
      }
      setRoomDialog(null);
      refetchRooms();
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
      if (!res.ok) {
        setFormError(await failure(res, 'Could not add the room type. Please try again.'));
        return;
      }
      setRoomTypeForm(EMPTY_TYPE);
      refetchRoomTypes();
      showToast('Room type added', 'success');
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

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
      showToast(message, 'success', () => {
        apply(before).catch(() => {
          refetchRooms();
          showToast(`Could not undo for room ${room.roomNumber}.`, 'error');
        });
        setToast(null);
      });
    } catch {
      setRooms(rs => rs.map(r => (r.id === room.id ? { ...r, status: before } : r)));
      showToast(`Could not change room ${room.roomNumber}. Please try again.`, 'error');
    }
  };

  const checkOut = async (room: Room) => {
    const stay = stayFor(room);
    if (!stay) {
      changeStatus(room, 'cleaning', `Room ${room.roomNumber} is being cleaned.`);
      return;
    }
    setSelectedId(null);
    try {
      const res = await fetch(`/api/bookings/${stay.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-out' }),
      });
      if (!res.ok) throw new Error(await failure(res, `Could not check out room ${room.roomNumber}. Please try again.`));
      refetchRooms();
      refetchStays();
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
      if (!res.ok) {
        setFormError(await failure(res, 'Could not delete the room. Please try again.'));
        return;
      }
      setDeleting(null);
      refetchRooms();
      showToast('Room deleted', 'success');
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;

  const noTenant = roomsError?.includes('401') || roomsError?.includes('NO_TENANT');
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

  const roomStatusLabels: Record<RoomStatus, string> = {
    available: m.rooms.available,
    occupied: m.rooms.occupied,
    cleaning: m.rooms.cleaning,
    maintenance: m.rooms.outOfOrder,
    dirty: m.rooms.dirty,
    inspected: m.rooms.inspected,
    blocked: m.rooms.blocked,
  };

  const tabs = [
    { value: 'all', label: m.common.all, count: count('all') },
    ...ROOM_STATUS_ORDER
      .filter(s => !['blocked', 'dirty', 'inspected'].includes(s) || count(s) > 0)
      .map(s => ({ value: s, label: roomStatusLabels[s] ?? roomStatus(s).label, count: count(s) })),
  ];

  const selected = rooms.find(r => r.id === selectedId) ?? null;

  const actionsFor = (room: Room): { label: string; primary?: boolean; run: () => void }[] => {
    const n = room.roomNumber;
    switch (room.status) {
      case 'occupied': return [{ label: 'Check out guest', primary: true, run: () => checkOut(room) }];
      case 'available': return [
        { label: 'Mark dirty', run: () => changeStatus(room, 'dirty', `Room ${n} marked dirty for housekeeping.`) },
        { label: 'Block room', run: () => changeStatus(room, 'blocked', `Room ${n} blocked.`) },
        { label: 'Mark out of order', run: () => changeStatus(room, 'maintenance', `Room ${n} marked out of order.`) },
      ];
      case 'dirty': return [
        { label: 'Start cleaning', primary: true, run: () => changeStatus(room, 'cleaning', `Room ${n} housekeeping started.`) },
        { label: 'Mark inspected', run: () => changeStatus(room, 'inspected', `Room ${n} inspected.`) },
        { label: 'Mark as clean', run: () => changeStatus(room, 'available', `Room ${n} marked clean.`) },
        { label: 'Mark out of order', run: () => changeStatus(room, 'maintenance', `Room ${n} marked out of order.`) },
      ];
      case 'cleaning': return [
        { label: 'Mark as clean', primary: true, run: () => changeStatus(room, 'available', `Room ${n} marked clean.`) },
        { label: 'Mark inspected', run: () => changeStatus(room, 'inspected', `Room ${n} marked inspected.`) },
        { label: 'Mark dirty', run: () => changeStatus(room, 'dirty', `Room ${n} marked dirty.`) },
        { label: 'Mark out of order', run: () => changeStatus(room, 'maintenance', `Room ${n} marked out of order.`) },
      ];
      case 'inspected': return [
        { label: 'Mark available', primary: true, run: () => changeStatus(room, 'available', `Room ${n} is ready to sell.`) },
        { label: 'Mark dirty', run: () => changeStatus(room, 'dirty', `Room ${n} sent back to housekeeping.`) },
        { label: 'Mark out of order', run: () => changeStatus(room, 'maintenance', `Room ${n} marked out of order.`) },
      ];
      case 'maintenance': return [{ label: 'Mark as fixed', primary: true, run: () => changeStatus(room, 'available', `Room ${n} marked as fixed.`) }];
      default: return [{ label: 'Unblock room', primary: true, run: () => changeStatus(room, 'available', `Room ${n} is open again.`) }];
    }
  };

  const summary = `${rooms.length} ${rooms.length === 1 ? m.rooms.room : m.rooms.roomsLabel} · ${count('occupied')} ${m.rooms.occupied.toLowerCase()} · ${count('available')} ${m.rooms.available.toLowerCase()}`;

  return (
    <div className="p-4 md:p-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="section-title">{m.rooms.title}</h1>
          <p className="section-sub">{rooms.length === 0 ? m.rooms.emptySub : summary}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" onClick={openRoomTypes}>
            <Bed className="w-4 h-4" aria-hidden="true" />
            {m.rooms.roomTypes}
          </Button>
          <Button variant="ghost" onClick={openAddRoom}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            {m.rooms.addRoom}
          </Button>
          <Link
            href="/dashboard/bookings?new=1"
            className="inline-flex items-center justify-center gap-2 font-medium rounded-lg px-6 py-3 bg-amber text-white hover:bg-amber-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {m.rooms.newBooking}
          </Link>
        </div>
      </div>

      {roomsError && !noTenant && (
        <p role="status" className="mb-6 rounded-lg bg-amber-pale px-4 py-3 text-sm text-amber-deep">
          Couldn&apos;t load the latest rooms. What you see may be out of date. Refresh the page to try again.
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <FilterTabs label="Show rooms that are" tabs={tabs} value={statusFilter} onChange={setStatusFilter} />
        <Input
          aria-label="Search rooms"
          placeholder={m.rooms.searchPlaceholder}
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
        floors.map(floor => (
          <FloorSection
            key={floor}
            floor={floor}
            rooms={filteredRooms.filter(r => (r.floor || 0) === floor)}
            stayFor={stayFor}
            onSelectRoom={setSelectedId}
          />
        ))
      )}

      {/* Room details drawer */}
      <RoomDetailDrawer
        selected={selected}
        stay={selected ? stayFor(selected) : undefined}
        onClose={() => setSelectedId(null)}
        actions={selected ? actionsFor(selected) : []}
        onOpenEdit={openEditRoom}
        onOpenDelete={(room) => {
          setSelectedId(null);
          setFormError('');
          setDeleting(room);
        }}
      />

      {/* Add / Edit Room Modal */}
      <AddRoomModal
        dialog={roomDialog}
        roomTypes={roomTypes}
        form={roomForm}
        setForm={setRoomForm}
        formError={formError}
        saving={saving}
        onClose={() => setRoomDialog(null)}
        onSave={handleSaveRoom}
      />

      {/* Room Types Modal */}
      <RoomTypesModal
        open={showRoomTypes}
        roomTypes={roomTypes}
        form={roomTypeForm}
        setForm={setRoomTypeForm}
        formError={formError}
        saving={saving}
        onClose={() => setShowRoomTypes(false)}
        onCreateType={handleCreateRoomType}
      />

      {/* Delete Room Modal */}
      <DeleteRoomModal
        room={deleting}
        formError={formError}
        saving={saving}
        onClose={() => setDeleting(null)}
        onDelete={handleDeleteRoom}
      />

      {/* Toast Notification */}
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
            {toast.undo && (
              <button
                onClick={toast.undo}
                className="ml-auto text-sm font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white rounded"
              >
                Undo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
