'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/ui/loading-state';

/** Billing is now one page per area. The old address sends people to the right one for their business. */
export default function BillingRedirect() {
  const router = useRouter();
  useEffect(() => {
    fetch('/api/tenant/info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => router.replace(data?.type === 'restaurant' ? '/dashboard/billing/restaurant' : '/dashboard/billing/hotel'))
      .catch(() => router.replace('/dashboard/billing/hotel'));
  }, [router]);
  return <LoadingState message="Opening billing..." />;
}
