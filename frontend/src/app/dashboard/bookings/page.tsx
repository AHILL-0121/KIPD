'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Plus, Calendar as CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { motion, AnimatePresence } from 'framer-motion';

interface Booking {
  id: string;
  guest: { id: string; name: string; email: string; phone?: string };
  room: { id: string; roomNumber: string; roomType: { name: string; basePrice: string } };
  checkInDate: string;
  checkOutDate: string;
  numGuests: number;
  status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  totalAmount: string;
  source: string;
  specialRequests?: string;
}

interface AvailableRoom {
  id: string;
  roomNumber: string;
  roomType: { id: string; name: string; basePrice: string };
  status: string;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    roomId: '',
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    checkInDate: '',
    checkOutDate: '',
    numGuests: '1',
    specialRequests: '',
  });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchBookings = () => {
    fetch('/api/bookings')
      .then(res => res.json())
      .then(data => setBookings(Array.isArray(data) ? data : []))
      .catch(console.error)
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

  const handleCreateBooking = async () => {
    if (!form.roomId || !form.guestName || !form.guestEmail || !form.checkInDate || !form.checkOutDate) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          numGuests: parseInt(form.numGuests) || 1,
          source: 'staff',
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setShowCreateModal(false);
      setForm({ roomId: '', guestName: '', guestEmail: '', guestPhone: '', checkInDate: '', checkOutDate: '', numGuests: '1', specialRequests: '' });
      fetchBookings();
      fetchRooms();
      showToast('Booking created successfully', 'success');
    } catch {
      showToast('Failed to create booking', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateBookingAction = async (bookingId: string, action: string) => {
    try {
      await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      fetchBookings();
      fetchRooms();
      showToast(`Booking ${action.replace('-', ' ')} successfully`, 'success');
    } catch {
      showToast(`Failed to ${action}`, 'error');
    }
  };

  const statusConfig: Record<string, { badge: string; label: string }> = {
    pending: { badge: 'amber', label: 'Pending' },
    confirmed: { badge: 'sage', label: 'Confirmed' },
    checked_in: { badge: 'terra', label: 'Checked In' },
    checked_out: { badge: 'stone', label: 'Checked Out' },
    cancelled: { badge: 'stone', label: 'Cancelled' },
  };

  const filteredBookings = bookings.filter(b => {
    const matchesSearch = 
      b.guest?.name?.toLowerCase().includes(search.toLowerCase()) || 
      b.guest?.email?.toLowerCase().includes(search.toLowerCase()) ||
      b.room?.roomNumber?.includes(search);
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const availableRooms = rooms.filter(r => r.status === 'available');

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Bookings</h1>
          <p className="section-sub">Manage reservations and check-ins</p>
        </div>
        
        <Button onClick={() => {
          if (availableRooms.length === 0) {
            showToast('No available rooms. Add rooms first.', 'error');
            return;
          }
          setForm({ ...form, roomId: availableRooms[0]?.id || '' });
          setShowCreateModal(true);
        }}>
          <Plus className="w-4 h-4" />
          New Booking
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <Input
            placeholder="Search by guest name, email, or room..."
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
            { value: 'pending', label: 'Pending' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'checked_in', label: 'Checked In' },
            { value: 'checked_out', label: 'Checked Out' },
          ]}
        />
      </div>

      {/* Bookings List */}
      {loading ? (
        <LoadingState message="Loading bookings..." />
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          title={search || statusFilter !== 'all' ? "No Results Found" : "No Bookings Yet"}
          description={
            search || statusFilter !== 'all' 
              ? "Try adjusting your filters."
              : "Create your first booking to get started."
          }
          actionLabel={!search && statusFilter === 'all' ? "Create First Booking" : undefined}
          onAction={!search && statusFilter === 'all' ? () => setShowCreateModal(true) : undefined}
        />
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => {
            const config = statusConfig[booking.status] || statusConfig.pending;
            
            return (
              <Card key={booking.id} hover className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-bold text-lg text-ink">{booking.guest?.name || 'Guest'}</h3>
                      <Badge variant={config.badge as any} dot>
                        {config.label}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-ink-muted mb-1">Contact</div>
                        <div className="text-ink">{booking.guest?.email}</div>
                      </div>
                      
                      <div>
                        <div className="text-ink-muted mb-1">Room</div>
                        <div className="text-ink font-medium">
                          Room {booking.room?.roomNumber} • {booking.room?.roomType?.name || 'Standard'}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-ink-muted mb-1">Stay Period</div>
                        <div className="text-ink">
                          {format(new Date(booking.checkInDate), 'MMM d')} - {format(new Date(booking.checkOutDate), 'MMM d, yyyy')}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-ink-muted mb-1">Amount</div>
                        <div className="text-ink font-bold">{formatCurrency(Number(booking.totalAmount))}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 ml-6">
                    {booking.status === 'confirmed' && (
                      <Button size="sm" variant="sage" onClick={() => updateBookingAction(booking.id, 'check-in')}>
                        Check In
                      </Button>
                    )}
                    {booking.status === 'checked_in' && (
                      <Button size="sm" variant="terra" onClick={() => updateBookingAction(booking.id, 'check-out')}>
                        Check Out
                      </Button>
                    )}
                    {(booking.status === 'pending' || booking.status === 'confirmed') && (
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => updateBookingAction(booking.id, 'cancel')}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Booking Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-bold">New Booking</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="space-y-4">
                <Select
                  label="Room"
                  value={form.roomId}
                  onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                  options={availableRooms.map(r => ({ 
                    value: r.id, 
                    label: `Room ${r.roomNumber} - ${r.roomType?.name || 'Standard'} (${formatCurrency(Number(r.roomType?.basePrice || 0))}/night)` 
                  }))}
                />
                <Input 
                  label="Guest Name *" 
                  placeholder="Guest full name" 
                  value={form.guestName}
                  onChange={(e) => setForm({ ...form, guestName: e.target.value })}
                />
                <Input 
                  label="Guest Email *" 
                  type="email"
                  placeholder="guest@email.com" 
                  value={form.guestEmail}
                  onChange={(e) => setForm({ ...form, guestEmail: e.target.value })}
                />
                <Input 
                  label="Guest Phone" 
                  placeholder="+91 98765 43210" 
                  value={form.guestPhone}
                  onChange={(e) => setForm({ ...form, guestPhone: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="Check-in Date *" 
                    type="date"
                    value={form.checkInDate}
                    onChange={(e) => setForm({ ...form, checkInDate: e.target.value })}
                  />
                  <Input 
                    label="Check-out Date *" 
                    type="date"
                    value={form.checkOutDate}
                    onChange={(e) => setForm({ ...form, checkOutDate: e.target.value })}
                  />
                </div>
                <Input 
                  label="Number of Guests" 
                  type="number"
                  value={form.numGuests}
                  onChange={(e) => setForm({ ...form, numGuests: e.target.value })}
                />
                <Input 
                  label="Special Requests" 
                  placeholder="Any special requests..." 
                  value={form.specialRequests}
                  onChange={(e) => setForm({ ...form, specialRequests: e.target.value })}
                />
                
                <div className="flex gap-3 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowCreateModal(false)} disabled={saving}>Cancel</Button>
                  <Button variant="terra" className="flex-1" onClick={handleCreateBooking} disabled={saving}>
                    {saving ? 'Creating...' : 'Create Booking'}
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
