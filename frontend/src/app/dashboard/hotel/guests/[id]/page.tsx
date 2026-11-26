'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, Download, IndianRupee, Mail, Phone, User } from 'lucide-react';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { GuestPreferencesForm } from '@/components/guests/guest-preferences-form';
import { useQuery } from '@/hooks/use-query';
import { formatCurrency } from '@/lib/currency';
import { realEmail } from '@/lib/guest-email';
import { bookingStatus, type BookingStatus } from '@/lib/booking-status';

interface GuestProfilePayload {
  guest: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    preferences: Record<string, unknown>;
    notes: string;
    createdAt: string;
  };
  bookings: Array<{
    id: string;
    checkInDate: string;
    checkOutDate: string;
    numGuests: number;
    status: BookingStatus;
    totalAmount: number;
    source: string | null;
    specialRequests: string | null;
    propertyName: string | null;
    roomNumber: string | null;
    roomTypeName: string | null;
  }>;
  stats: {
    totalBookings: number;
    completedStays: number;
    totalBilled: number;
    totalPaid: number;
  };
}

export default function GuestProfilePage({ params }: { params: { id: string } }) {
  const { data, isLoading, error, refetch } = useQuery<GuestProfilePayload>(`/api/guests/${params.id}`, [params.id]);

  if (isLoading && !data) return <LoadingState message="Loading guest profile..." />;
  if (error || !data) return <ErrorState message={error || 'Guest not found'} reset={refetch} />;

  const { guest, bookings, stats } = data;
  const email = realEmail(guest.email);

  return (
    <div className="p-4 md:p-8 overflow-x-hidden space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/dashboard/bookings" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-amber-deep mb-2">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Bookings
          </Link>
          <h1 className="section-title flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-amber-pale text-amber-deep inline-flex items-center justify-center">
              <User className="w-5 h-5" aria-hidden="true" />
            </span>
            {guest.name}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-ink-muted mt-1">
            {email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-4 h-4" aria-hidden="true" />
                {email}
              </span>
            )}
            {guest.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-4 h-4" aria-hidden="true" />
                {guest.phone}
              </span>
            )}
            <span>Guest since {format(new Date(guest.createdAt), 'MMM yyyy')}</span>
          </div>
        </div>

        <a href={`/api/guests/${guest.id}/privacy`} download>
          <Button variant="ghost" size="sm">
            <Download className="w-4 h-4" aria-hidden="true" />
            Export PII (DPDP)
          </Button>
        </a>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card hover={false}>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Bookings</div>
          <div className="text-2xl font-bold text-ink mt-1">{stats.totalBookings}</div>
        </Card>
        <Card hover={false}>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Completed Stays</div>
          <div className="text-2xl font-bold text-sage-deep mt-1">{stats.completedStays}</div>
        </Card>
        <Card hover={false}>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Billed</div>
          <div className="text-2xl font-bold text-ink mt-1 flex items-center gap-1">
            <IndianRupee className="w-4 h-4 text-ink-muted" aria-hidden="true" />
            {formatCurrency(stats.totalBilled)}
          </div>
        </Card>
        <Card hover={false}>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Paid</div>
          <div className="text-2xl font-bold text-amber-deep mt-1">{formatCurrency(stats.totalPaid)}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card hover={false}>
          <CardTitle className="mb-1">Stay Preferences &amp; Notes</CardTitle>
          <CardDescription className="mb-4">Personalize future stays and share reminders with front desk staff.</CardDescription>
          <GuestPreferencesForm
            guestId={guest.id}
            initialPreferences={guest.preferences}
            initialNotes={guest.notes}
            onSaved={refetch}
          />
        </Card>

        <Card hover={false}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle>Stay History</CardTitle>
              <CardDescription>Past and upcoming reservations for {guest.name}</CardDescription>
            </div>
            <Calendar className="w-5 h-5 text-amber-deep" aria-hidden="true" />
          </div>

          {bookings.length === 0 ? (
            <p className="text-sm text-ink-muted py-8 text-center">No reservations recorded for this guest.</p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => {
                const st = bookingStatus(b.status);
                return (
                  <div key={b.id} className="p-3.5 rounded-xl bg-cream border border-stone-200 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ink">Room {b.roomNumber || '—'}</span>
                        {b.roomTypeName && <span className="text-xs text-ink-muted">· {b.roomTypeName}</span>}
                        <Badge variant={st.tone} dot>{st.label}</Badge>
                      </div>
                      <div className="text-xs text-ink-muted mt-1">
                        {format(new Date(b.checkInDate), 'd MMM yyyy')} → {format(new Date(b.checkOutDate), 'd MMM yyyy')} · {b.numGuests} {b.numGuests === 1 ? 'guest' : 'guests'}
                      </div>
                      {b.specialRequests && (
                        <div className="text-xs text-ink-soft mt-1 italic">&ldquo;{b.specialRequests}&rdquo;</div>
                      )}
                    </div>
                    <div className="text-right shrink-0 font-semibold text-ink">
                      {formatCurrency(b.totalAmount)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
