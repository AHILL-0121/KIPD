'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wrench, RefreshCw, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface MaintenanceInfo {
  enabled: boolean;
  message: string;
  estimatedEnd: string | null;
}

export default function MaintenancePage() {
  const [info, setInfo] = useState<MaintenanceInfo>({
    enabled: true,
    message: 'Kipd is currently undergoing scheduled maintenance. Normal operations will resume shortly.',
    estimatedEnd: null,
  });
  const [checking, setChecking] = useState(false);

  const load = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/maintenance', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as MaintenanceInfo;
        setInfo(data);
        if (!data.enabled && typeof window !== 'undefined') {
          window.location.href = '/dashboard';
        }
      }
    } catch {
      // keep default copy
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-4">
      <Card hover={false} className="max-w-lg w-full text-center p-8 md:p-10">
        <div className="w-16 h-16 rounded-2xl bg-amber-pale text-amber-deep mx-auto mb-6 flex items-center justify-center">
          <Wrench className="w-8 h-8" aria-hidden="true" />
        </div>

        <h1 className="font-serif text-3xl font-bold text-ink mb-3">
          Scheduled Maintenance
        </h1>

        <p className="text-ink-muted leading-relaxed mb-4">
          {info.message}
        </p>

        {info.estimatedEnd && (
          <p className="text-sm font-medium text-amber-deep bg-amber-pale/60 rounded-xl py-2.5 px-4 mb-6 inline-block">
            Expected return: {info.estimatedEnd}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
          <Button onClick={load} disabled={checking} className="w-full sm:w-auto min-h-[44px]">
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
            {checking ? 'Checking status...' : 'Check status'}
          </Button>
          <Link
            href="/admin/settings"
            className="inline-flex items-center justify-center gap-2 text-sm font-medium text-ink-muted hover:text-ink px-4 py-2.5 rounded-xl min-h-[44px]"
          >
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            Platform Admin
          </Link>
        </div>
      </Card>
    </main>
  );
}
