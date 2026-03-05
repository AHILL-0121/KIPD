'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Plus, Search, Edit, Bed, Hotel as HotelIcon, Trash2, X } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
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
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'blocked';
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddRoomType, setShowAddRoomType] = useState(false);
  const [showEditRoom, setShowEditRoom] = useState<Room | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form states
  const [roomForm, setRoomForm] = useState({ roomNumber: '', roomTypeId: '', floor: '1', status: 'available' });
  const [roomTypeForm, setRoomTypeForm] = useState({ name: '', basePrice: '', maxOccupancy: '2', description: '' });
  const [saving, setSaving] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRooms = () => {
    fetch('/api/rooms')
      .then(res => {
        if (!res.ok) {
          if (res.status === 401) throw new Error('NO_TENANT');
          throw new Error('Failed to fetch rooms');
        }
        return res.json();
      })
      .then(data => setRooms(Array.isArray(data) ? data : []))
      .catch(err => {
        if (err.message === 'NO_TENANT') setError('NO_TENANT');
        else setError('Failed to load rooms');
      })
      .finally(() => setLoading(false));
  };

  const fetchRoomTypes = () => {
    fetch('/api/room-types')
      .then(res => res.json())
      .then(data => setRoomTypes(Array.isArray(data) ? data : []))
      .catch(console.error);
  };

  useEffect(() => {
    fetchRooms();
    fetchRoomTypes();
  }, []);

  const handleCreateRoom = async () => {
    if (!roomForm.roomNumber || !roomForm.roomTypeId) {
      showToast('Room number and type are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber: roomForm.roomNumber,
          roomTypeId: roomForm.roomTypeId,
          floor: parseInt(roomForm.floor) || 1,
          status: roomForm.status,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setShowAddRoom(false);
      setRoomForm({ roomNumber: '', roomTypeId: '', floor: '1', status: 'available' });
      fetchRooms();
      showToast('Room created successfully', 'success');
    } catch {
      showToast('Failed to create room', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRoomType = async () => {
    if (!roomTypeForm.name || !roomTypeForm.basePrice) {
      showToast('Name and base price are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/room-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomTypeForm.name,
          basePrice: parseFloat(roomTypeForm.basePrice),
          maxOccupancy: parseInt(roomTypeForm.maxOccupancy) || 2,
          description: roomTypeForm.description,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setShowAddRoomType(false);
      setRoomTypeForm({ name: '', basePrice: '', maxOccupancy: '2', description: '' });
      fetchRoomTypes();
      showToast('Room type created successfully', 'success');
    } catch {
      showToast('Failed to create room type', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRoomStatus = async (roomId: string, newStatus: string) => {
    try {
      await fetch('/api/rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, status: newStatus }),
      });
      setRooms(rooms.map(r => r.id === roomId ? { ...r, status: newStatus as any } : r));
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const handleEditRoom = async () => {
    if (!showEditRoom) return;
    setSaving(true);
    try {
      await fetch('/api/rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: showEditRoom.id,
          roomNumber: roomForm.roomNumber,
          roomTypeId: roomForm.roomTypeId,
          floor: parseInt(roomForm.floor) || 1,
        }),
      });
      setShowEditRoom(null);
      fetchRooms();
      showToast('Room updated successfully', 'success');
    } catch {
      showToast('Failed to update room', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    try {
      await fetch(`/api/rooms?id=${roomId}`, { method: 'DELETE' });
      fetchRooms();
      showToast('Room deleted', 'success');
    } catch {
      showToast('Failed to delete room', 'error');
    }
  };

  const statusConfig: Record<string, { badge: string; label: string }> = {
    available: { badge: 'sage', label: 'Available' },
    occupied: { badge: 'terra', label: 'Occupied' },
    cleaning: { badge: 'amber', label: 'Cleaning' },
    maintenance: { badge: 'stone', label: 'Maintenance' },
    blocked: { badge: 'stone', label: 'Blocked' },
  };

  if (loading) return <LoadingState />;

  if (error === 'NO_TENANT') {
    return (
      <div className="p-8">
        <EmptyState
          icon={HotelIcon}
          title="No Tenant Assigned"
          message="You need to be assigned to a tenant to view rooms."
          action="/admin/tenants"
          actionLabel="Go to Admin Panel"
        />
      </div>
    );
  }

  const filteredRooms = rooms.filter(r => {
    const matchesSearch = r.roomNumber.includes(search) || r.roomType?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Rooms</h1>
          <p className="section-sub">Manage room inventory and status</p>
        </div>
        
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setShowAddRoomType(true)}>
            <Bed className="w-4 h-4" />
            Room Types
          </Button>
          <Button onClick={() => {
            if (roomTypes.length === 0) {
              showToast('Create a room type first before adding rooms', 'error');
              setShowAddRoomType(true);
              return;
            }
            setRoomForm({ roomNumber: '', roomTypeId: roomTypes[0]?.id || '', floor: '1', status: 'available' });
            setShowAddRoom(true);
          }}>
            <Plus className="w-4 h-4" />
            Add Room
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <Input
            placeholder="Search by room number or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>
        
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Status' },
            { value: 'available', label: 'Available' },
            { value: 'occupied', label: 'Occupied' },
            { value: 'cleaning', label: 'Cleaning' },
            { value: 'maintenance', label: 'Maintenance' },
          ]}
        />
      </div>

      {/* Rooms Grid */}
      {filteredRooms.length === 0 ? (
        <EmptyState
          title={search || statusFilter !== 'all' ? "No Results Found" : "No Rooms Yet"}
          description={
            search || statusFilter !== 'all' 
              ? "Try adjusting your filters."
              : "Start adding rooms to manage your property inventory."
          }
          actionLabel={!search && statusFilter === 'all' ? "Add First Room" : undefined}
          onAction={!search && statusFilter === 'all' ? () => {
            if (roomTypes.length === 0) {
              setShowAddRoomType(true);
            } else {
              setRoomForm({ roomNumber: '', roomTypeId: roomTypes[0]?.id || '', floor: '1', status: 'available' });
              setShowAddRoom(true);
            }
          } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredRooms.map((room) => {
            const config = statusConfig[room.status] || statusConfig.available;
            
            return (
              <Card key={room.id} hover className="relative">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-xl text-ink">Room {room.roomNumber}</h3>
                    <p className="text-sm text-ink-muted">{room.roomType?.name || 'Unknown'}</p>
                  </div>
                  
                  <Badge variant={config.badge as any} dot>
                    {config.label}
                  </Badge>
                </div>
                
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Floor</span>
                    <span className="text-ink font-medium">{room.floor || 1}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Price</span>
                    <span className="text-ink font-medium">{formatCurrency(Number(room.roomType?.basePrice || 0))}/night</span>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-3 border-t border-stone-200">
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => {
                    setShowEditRoom(room);
                    setRoomForm({
                      roomNumber: room.roomNumber,
                      roomTypeId: room.roomTypeId,
                      floor: String(room.floor || 1),
                      status: room.status,
                    });
                  }}>
                    <Edit className="w-4 h-4" />
                    Edit
                  </Button>
                  <Select
                    value={room.status}
                    onChange={(e) => handleUpdateRoomStatus(room.id, e.target.value)}
                    options={[
                      { value: 'available', label: 'Available' },
                      { value: 'occupied', label: 'Occupied' },
                      { value: 'cleaning', label: 'Cleaning' },
                      { value: 'maintenance', label: 'Maintenance' },
                      { value: 'blocked', label: 'Blocked' },
                    ]}
                    className="flex-1"
                  />
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteRoom(room.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Room Modal */}
      <AnimatePresence>
        {showAddRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddRoom(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">Add Room</h2>
                <button onClick={() => setShowAddRoom(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="space-y-4">
                <Input 
                  label="Room Number" 
                  placeholder="101" 
                  value={roomForm.roomNumber}
                  onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })}
                />
                <Select
                  label="Room Type"
                  value={roomForm.roomTypeId}
                  onChange={(e) => setRoomForm({ ...roomForm, roomTypeId: e.target.value })}
                  options={roomTypes.map(rt => ({ value: rt.id, label: `${rt.name} - ${formatCurrency(Number(rt.basePrice))}/night` }))}
                />
                <Input 
                  label="Floor" 
                  type="number"
                  placeholder="1" 
                  value={roomForm.floor}
                  onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                />
                
                <div className="flex gap-3 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowAddRoom(false)} disabled={saving}>Cancel</Button>
                  <Button variant="terra" className="flex-1" onClick={handleCreateRoom} disabled={saving}>
                    {saving ? 'Creating...' : 'Add Room'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Room Modal */}
      <AnimatePresence>
        {showEditRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowEditRoom(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">Edit Room</h2>
                <button onClick={() => setShowEditRoom(null)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="space-y-4">
                <Input 
                  label="Room Number" 
                  value={roomForm.roomNumber}
                  onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })}
                />
                <Select
                  label="Room Type"
                  value={roomForm.roomTypeId}
                  onChange={(e) => setRoomForm({ ...roomForm, roomTypeId: e.target.value })}
                  options={roomTypes.map(rt => ({ value: rt.id, label: `${rt.name} - ${formatCurrency(Number(rt.basePrice))}/night` }))}
                />
                <Input 
                  label="Floor" 
                  type="number"
                  value={roomForm.floor}
                  onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                />
                
                <div className="flex gap-3 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowEditRoom(null)} disabled={saving}>Cancel</Button>
                  <Button variant="terra" className="flex-1" onClick={handleEditRoom} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Room Type Modal */}
      <AnimatePresence>
        {showAddRoomType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddRoomType(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">Add Room Type</h2>
                <button onClick={() => setShowAddRoomType(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="space-y-4">
                {/* Existing room types list */}
                {roomTypes.length > 0 && (
                  <div className="mb-4">
                    <label className="text-sm font-medium text-ink block mb-2">Existing Room Types</label>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {roomTypes.map(rt => (
                        <div key={rt.id} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-sm">
                          <span className="font-medium">{rt.name}</span>
                          <span className="text-ink-muted">{formatCurrency(Number(rt.basePrice))}/night</span>
                        </div>
                      ))}
                    </div>
                    <hr className="mt-4" />
                  </div>
                )}

                <Input 
                  label="Type Name" 
                  placeholder="Deluxe Suite" 
                  value={roomTypeForm.name}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, name: e.target.value })}
                />
                <Input 
                  label="Base Price (₹ per night)" 
                  type="number"
                  placeholder="3000" 
                  value={roomTypeForm.basePrice}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, basePrice: e.target.value })}
                />
                <Input 
                  label="Max Occupancy" 
                  type="number"
                  placeholder="2" 
                  value={roomTypeForm.maxOccupancy}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, maxOccupancy: e.target.value })}
                />
                <Input 
                  label="Description" 
                  placeholder="A luxurious room with a city view" 
                  value={roomTypeForm.description}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, description: e.target.value })}
                />
                
                <div className="flex gap-3 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowAddRoomType(false)} disabled={saving}>Close</Button>
                  <Button variant="terra" className="flex-1" onClick={handleCreateRoomType} disabled={saving}>
                    {saving ? 'Creating...' : 'Add Room Type'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-8 right-8 z-50 px-6 py-4 rounded-lg shadow-lg ${
              toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-900' : 'bg-red-50 border border-red-200 text-red-900'
            }`}
          >
            <span className="font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
