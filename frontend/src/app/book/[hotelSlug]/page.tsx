'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { KipdMascot } from '@/components/mascot/KipdMascot';
import { Calendar, Users, Hotel, Check } from 'lucide-react';
import { addDays, format } from 'date-fns';

interface RoomType {
  id: string;
  name: string;
  basePrice: number;
  maxOccupancy: number;
  description: string;
  amenities: string[];
}

export default function BookingPage({ params }: { params: { hotelSlug: string } }) {
  const [hotelName, setHotelName] = useState('');
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [checkIn, setCheckIn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [checkOut, setCheckOut] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [guests, setGuests] = useState(2);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [guestInfo, setGuestInfo] = useState({ name: '', email: '', phone: '' });
  const [step, setStep] = useState<'select' | 'details' | 'confirm'>('select');

  useEffect(() => {
    // Fetch hotel and room types
    fetch(`/api/book/${params.hotelSlug}`)
      .then(res => res.json())
      .then(data => {
        setHotelName(data.hotelName);
        setRoomTypes(data.roomTypes);
      })
      .catch(console.error);
  }, [params.hotelSlug]);

  const handleBooking = async () => {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotelSlug: params.hotelSlug,
        roomTypeId: selectedRoom,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        numGuests: guests,
        guestInfo,
      }),
    });

    if (response.ok) {
      setStep('confirm');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-amber-pale">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <KipdMascot size="sm" animated={false} />
            <div>
              <h1 className="font-serif text-2xl font-bold text-ink">{hotelName}</h1>
              <p className="text-sm text-ink-muted">Book your stay</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {step === 'select' && (
          <>
            {/* Search Bar */}
            <Card hover={false} className="mb-8 p-6">
              <div className="grid grid-cols-4 gap-4">
                <Input
                  type="date"
                  label="Check-in"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
                <Input
                  type="date"
                  label="Check-out"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
                <Input
                  type="number"
                  label="Guests"
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                  min={1}
                />
                <Button className="self-end" variant="primary">
                  Search Rooms
                </Button>
              </div>
            </Card>

            {/* Room Types */}
            <div>
              <h2 className="section-title mb-6">Available Rooms</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                {roomTypes.map((room) => (
                  <Card 
                    key={room.id}
                    hover
                    className={`cursor-pointer transition-all ${selectedRoom === room.id ? 'ring-4 ring-amber' : ''}`}
                    onClick={() => setSelectedRoom(room.id)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-serif text-2xl font-bold text-ink mb-2">{room.name}</h3>
                        <p className="text-ink-muted">{room.description}</p>
                      </div>
                      
                      {selectedRoom === room.id && (
                        <div className="w-8 h-8 bg-amber rounded-full flex items-center justify-center">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-ink-muted">
                        <Users className="w-4 h-4" />
                        <span>Up to {room.maxOccupancy} guests</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                      {room.amenities.map((amenity) => (
                        <span key={amenity} className="px-3 py-1 bg-stone-100 rounded-full text-xs text-ink-soft">
                          {amenity}
                        </span>
                      ))}
                    </div>
                    
                    <div className="pt-4 border-t border-stone-200 flex items-center justify-between">
                      <span className="text-sm text-ink-muted">per night</span>
                      <span className="text-3xl font-bold text-amber">${room.basePrice}</span>
                    </div>
                  </Card>
                ))}
              </div>
              
              {selectedRoom && (
                <div className="mt-8 flex justify-center">
                  <Button size="lg" variant="terra" onClick={() => setStep('details')}>
                    Continue to Guest Details →
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {step === 'details' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="section-title mb-8">Guest Information</h2>
            
            <Card hover={false} className="p-8">
              <div className="space-y-4">
                <Input
                  label="Full Name"
                  placeholder="John Smith"
                  value={guestInfo.name}
                  onChange={(e) => setGuestInfo({ ...guestInfo, name: e.target.value })}
                />
                
                <Input
                  label="Email"
                  type="email"
                  placeholder="john@example.com"
                  value={guestInfo.email}
                  onChange={(e) => setGuestInfo({ ...guestInfo, email: e.target.value })}
                />
                
                <Input
                  label="Phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={guestInfo.phone}
                  onChange={(e) => setGuestInfo({ ...guestInfo, phone: e.target.value })}
                />
                
                <div className="pt-6 flex gap-3">
                  <Button variant="ghost" className="flex-1" onClick={() => setStep('select')}>
                    ← Back
                  </Button>
                  <Button variant="terra" className="flex-1" onClick={handleBooking}>
                    Confirm Booking →
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {step === 'confirm' && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="mb-8">
              <KipdMascot size="lg" />
            </div>
            
            <h2 className="font-serif text-4xl font-bold text-ink mb-4">
              Booking Confirmed!
            </h2>
            
            <p className="text-lg text-ink-muted mb-8">
              Check your email for confirmation details. We look forward to welcoming you!
            </p>
            
            <Card hover={false} className="p-8 text-left">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Guest</span>
                  <span className="text-ink font-medium">{guestInfo.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Check-in</span>
                  <span className="text-ink font-medium">{format(new Date(checkIn), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Check-out</span>
                  <span className="text-ink font-medium">{format(new Date(checkOut), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
