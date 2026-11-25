'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface UpdateInfo {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
}

declare global {
  interface Window {
    AndroidUpdater?: { getVersionCode?: () => number };
  }
}

export function AndroidUpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const currentCode = window.AndroidUpdater?.getVersionCode?.();
    if (typeof currentCode !== 'number' || currentCode <= 0) return;

    fetch('/api/android/version')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UpdateInfo | null) => {
        if (data && typeof data.versionCode === 'number' && data.versionCode > currentCode) {
          setUpdate(data);
        }
      })
      .catch(() => {
        // Ignore version check failures silently when offline
      });
  }, []);

  if (!update || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 left-3 right-3 z-[90] md:left-auto md:right-6 md:max-w-sm bg-ink text-white rounded-2xl p-4 shadow-xl flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">App update available (v{update.versionName})</p>
        <p className="text-xs text-stone-300 truncate">Download the latest Kipd Android build</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <a
          href={update.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber px-3 py-2 text-xs font-semibold text-white hover:bg-amber-deep min-h-[44px]"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Update
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss update prompt"
          className="p-2 text-stone-300 hover:text-white min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
