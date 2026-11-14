'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

// One list for the whole app, kept outside React so `toast()` works from any handler without a provider.
// (The old version read a context that nothing ever provided, so every toast was silently dropped.)
let items: ToastItem[] = [];
let nextId = 0;
const listeners = new Set<(list: ToastItem[]) => void>();
const publish = () => listeners.forEach((l) => l(items));

function dismiss(id: string) {
  items = items.filter((t) => t.id !== id);
  publish();
}

/** Show a short message in the corner. Errors stay a little longer than confirmations. */
export function toast(type: ToastType, title: string, message?: string) {
  const id = String(++nextId);
  items = [...items, { id, type, title, message }].slice(-5);
  publish();
  setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000);
}

const ICONS = {
  success: <CheckCircle className="w-5 h-5 text-sage shrink-0" aria-hidden />,
  error: <AlertCircle className="w-5 h-5 text-terra shrink-0" aria-hidden />,
  info: <Info className="w-5 h-5 text-amber shrink-0" aria-hidden />,
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setToasts);
    setToasts(items);
    return () => { listeners.delete(setToasts); };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-[300] flex flex-col gap-3 sm:max-w-md pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="pointer-events-auto bg-white rounded-xl shadow-xl p-4 border border-stone-200 flex items-start gap-3"
          >
            {ICONS[t.type]}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ink text-sm">{t.title}</p>
              {t.message && <p className="text-xs text-ink-muted mt-1">{t.message}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="text-stone-500 hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useToast() {
  return { toast };
}

/** For tests only. */
export function resetToasts() {
  items = [];
  publish();
}
