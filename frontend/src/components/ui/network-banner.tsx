'use client';

import { useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getQueue, OFFLINE_QUEUE_EVENT, replayQueue } from '@/lib/offline-queue';

export function NetworkBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const syncQueueState = useCallback(() => {
    setPendingCount(getQueue().length);
  }, []);

  const flushQueue = useCallback(async () => {
    if (getQueue().length === 0) return;
    setSyncing(true);
    const result = await replayQueue();
    setSyncing(false);
    setPendingCount(result.remaining);
    if (result.synced > 0) {
      setSyncNotice(`Synced ${result.synced} offline POS ${result.synced === 1 ? 'action' : 'actions'}`);
      window.dispatchEvent(new CustomEvent('kipd:refresh'));
      window.setTimeout(() => setSyncNotice(null), 4000);
    }
  }, []);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsOffline(!navigator.onLine);
    }
    syncQueueState();
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void flushQueue();
    }

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
      setIsOffline(false);
      void flushQueue();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener(OFFLINE_QUEUE_EVENT, syncQueueState);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, syncQueueState);
    };
  }, [flushQueue, syncQueueState]);

  if (!isOffline && !syncing && pendingCount === 0 && !syncNotice) return null;

  const isSuccess = Boolean(syncNotice && !isOffline && !syncing);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-[100] px-4 py-2 text-xs md:text-sm font-medium flex items-center justify-center gap-2 shadow-md ${
        isSuccess ? 'bg-sage text-white' : isOffline ? 'bg-terra text-white' : 'bg-amber-deep text-white'
      }`}
    >
      {isSuccess ? (
        <>
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{syncNotice}</span>
        </>
      ) : syncing ? (
        <>
          <RefreshCw className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
          <span>Syncing {pendingCount} queued POS actions…</span>
        </>
      ) : isOffline ? (
        <>
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            You&apos;re currently offline.
            {pendingCount > 0 ? ` ${pendingCount} POS ${pendingCount === 1 ? 'action' : 'actions'} queued to sync.` : ' POS actions will queue safely.'}
          </span>
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{pendingCount} queued POS {pendingCount === 1 ? 'action' : 'actions'} pending sync.</span>
          <button type="button" onClick={() => void flushQueue()} className="underline font-semibold ml-1">
            Sync now
          </button>
        </>
      )}
    </div>
  );
}
