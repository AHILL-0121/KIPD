'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/ui/loading-state';
import { useTenantInfo } from '@/contexts/tenant-context';

/** Billing is now one page per area. The old address sends people to the right one for their business. */
export default function BillingRedirect() {
  const router = useRouter();
  const { info, isLoading } = useTenantInfo();

  useEffect(() => {
    if (isLoading) return;
    router.replace(info?.type === 'restaurant' ? '/dashboard/billing/restaurant' : '/dashboard/billing/hotel');
  }, [info, isLoading, router]);

  return <LoadingState message="Opening billing..." />;
}
