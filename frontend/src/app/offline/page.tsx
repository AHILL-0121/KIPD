'use client';

import { OfflineState } from '@/components/ui/offline-state';

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl shadow-sm p-6">
        <OfflineState />
      </div>
    </main>
  );
}
