'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export function NetworkBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Initial status
    if (typeof navigator !== 'undefined') {
      setIsOffline(!navigator.onLine);
    }

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[100] bg-terra text-white px-4 py-2 text-xs md:text-sm font-medium flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top duration-200"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>You&apos;re currently offline. Please check your internet connection.</span>
    </div>
  );
}
