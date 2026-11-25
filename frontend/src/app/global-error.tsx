'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6 text-center font-sans text-[#1C1917]">
        <div className="max-w-md bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-4">
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-sm text-stone-600">
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-xl bg-[#D97706] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#B45309]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
