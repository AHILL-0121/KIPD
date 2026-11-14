'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Wording of the button that goes ahead. Say what happens ("Delete table"), not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** true for something that removes or cannot be undone: the button is red */
  danger?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let current: Pending | null = null;
const listeners = new Set<(p: Pending | null) => void>();
const publish = () => listeners.forEach((l) => l(current));

/**
 * Replaces the browser's confirm(): `if (!(await confirmDialog({ title: 'Delete this table?' }))) return;`
 * Resolves true only when the person presses the confirm button. Needs <ConfirmHost /> in the root layout.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  current?.resolve(false); // a second question replaces an unanswered first one
  return new Promise<boolean>((resolve) => {
    current = { ...options, resolve };
    publish();
  });
}

function answer(ok: boolean) {
  const pending = current;
  current = null;
  publish();
  pending?.resolve(ok);
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(current);
  // Keep the wording on screen while the dialog animates out.
  const [shown, setShown] = useState<Pending | null>(current);
  useEffect(() => {
    const onChange = (p: Pending | null) => { setPending(p); if (p) setShown(p); };
    listeners.add(onChange);
    onChange(current);
    return () => { listeners.delete(onChange); };
  }, []);

  return (
    <Dialog open={!!pending} onClose={() => answer(false)} labelledBy="confirm-title" className="p-8 max-w-md w-full">
      {shown && (
        <>
          <h2 id="confirm-title" className="text-2xl font-bold text-ink">{shown.title}</h2>
          {shown.message && <p className="text-ink-muted mt-2">{shown.message}</p>}
          <div className="mt-6 flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => answer(false)}>{shown.cancelLabel ?? 'Cancel'}</Button>
            <Button variant={shown.danger ? 'terra' : 'primary'} className="flex-1" onClick={() => answer(true)}>{shown.confirmLabel ?? 'Confirm'}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
