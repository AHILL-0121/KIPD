'use client';

import { createContext, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToasterContextType {
  toast: (type: ToastType, title: string, message?: string) => void;
}

const ToasterContext = createContext<ToasterContextType | undefined>(undefined);

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-sage" />,
    error: <AlertCircle className="w-5 h-5 text-terra" />,
    info: <Info className="w-5 h-5 text-amber" />,
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-md">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.8 }}
            className="bg-white rounded-xl shadow-xl p-4 border border-stone-200 flex items-start gap-3 min-w-[320px]"
          >
            {icons[toast.type]}
            <div className="flex-1">
              <h4 className="font-medium text-ink text-sm">{toast.title}</h4>
              {toast.message && (
                <p className="text-xs text-ink-muted mt-1">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-stone-400 hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToasterContext);
  if (!context) {
    return {
      toast: (type: ToastType, title: string, message?: string) => {
        console.log(`Toast: [${type}] ${title}`, message);
      },
    };
  }
  return context;
}
