'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChefHat } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';

interface Outlet {
  id: string;
  name: string;
}

export default function KDSLandingPage() {
  const router = useRouter();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tenant/info')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.outlets) {
          setOutlets(data.outlets);
          if (data.outlets.length === 1) {
            router.replace(`/dashboard/kds/${data.outlets[0].id}`);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  if (loading) {
    return <LoadingState message="Loading kitchen displays..." />;
  }

  if (outlets.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <ChefHat className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-ink">No Outlets Found</h2>
          <p className="text-sm text-ink-muted mt-1">No restaurant outlets have been set up yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="font-serif text-3xl font-bold text-ink mb-2">Kitchen Display</h1>
      <p className="text-ink-muted mb-8">Select an outlet to view its orders</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {outlets.map(outlet => (
          <Link
            key={outlet.id}
            href={`/dashboard/kds/${outlet.id}`}
            className="flex items-center gap-4 p-6 bg-white border border-stone-200 rounded-2xl hover:border-amber hover:shadow-sm transition-all"
          >
            <ChefHat className="w-8 h-8 text-terra" />
            <span className="text-lg font-medium text-ink">{outlet.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
