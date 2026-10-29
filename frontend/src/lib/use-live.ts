'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps a screen fresh. Pushes (SSE) make it instant when the server can hold a connection open,
 * but on serverless hosting a push may never arrive, so the screen ALSO re-checks on a timer, when the
 * stream reconnects, and when the tab comes back to the front. Whichever fires first wins; a missed
 * push can delay an update by at most `intervalMs`, never lose it.
 *
 * `channel` is the tenant id or an outlet id (the server refuses anything else).
 */
export function useLive(refetch: () => void, channel: string | null | undefined, intervalMs = 10_000) {
  const latest = useRef(refetch);
  latest.current = refetch;

  useEffect(() => {
    const run = () => latest.current();
    const visibleRun = () => { if (document.visibilityState === 'visible') run(); };

    const timer = setInterval(visibleRun, intervalMs);
    document.addEventListener('visibilitychange', visibleRun);
    window.addEventListener('online', run);

    let stream: EventSource | null = null;
    if (channel) {
      let hadError = false;
      stream = new EventSource(`/api/sse/kds/${channel}`);
      stream.onmessage = (event) => {
        try { if (JSON.parse(event.data).type === 'connected') return; } catch { /* not JSON: treat as an update */ }
        run();
      };
      stream.onerror = () => { hadError = true; };
      stream.onopen = () => { if (hadError) { hadError = false; run(); } }; // came back: catch up on anything missed
    }

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibleRun);
      window.removeEventListener('online', run);
      stream?.close();
    };
  }, [channel, intervalMs]);
}
