'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** id of the element inside that holds the dialog's title */
  labelledBy: string;
  /** 'center' is a modal card; 'sheet' rises from the bottom on phones; 'drawer' slides in from the right */
  variant?: 'center' | 'sheet' | 'drawer';
  /** false while something is being saved: Escape and a click outside do nothing */
  dismissible?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The one dialog for the dashboard. It is rendered into <body>, so no transformed parent can move it,
 * and it keeps keyboard users inside: focus moves in on open, Tab wraps, Escape closes, and focus
 * goes back to whatever opened it.
 */
export function Dialog({ open, onClose, labelledBy, variant = 'center', dismissible = true, className = '', children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  closeRef.current = onClose;
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    // The title's own close button is first in the DOM, so prefer the first field or action after it.
    const first = focusables().find(el => el.getAttribute('aria-label') !== 'Close') ?? focusables()[0];
    (first ?? panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dismissibleRef.current) closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); panel?.focus(); return; }
      const active = document.activeElement;
      const outside = !panel?.contains(active);
      if (e.shiftKey && (outside || active === items[0] || active === panel)) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && (outside || active === items[items.length - 1])) { e.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  const sheet = variant === 'sheet';
  const drawer = variant === 'drawer';
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className={`fixed inset-0 z-[100] bg-black/60 flex justify-center ${drawer ? 'items-stretch justify-end' : sheet ? 'items-end md:items-center md:p-4' : 'items-center p-4'}`}
          onClick={() => { if (dismissible) onClose(); }}
        >
          <motion.div
            ref={panelRef}
            role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
            initial={drawer ? { x: '100%' } : sheet ? { y: '100%' } : { scale: 0.95, opacity: 0 }}
            animate={drawer ? { x: 0 } : sheet ? { y: 0 } : { scale: 1, opacity: 1 }}
            exit={drawer ? { x: '100%' } : sheet ? { y: '100%' } : { scale: 0.95, opacity: 0 }}
            transition={drawer ? { duration: 0.25, ease: 'easeOut' } : sheet ? { type: 'spring', damping: 25, stiffness: 200 } : { duration: 0.15 }}
            className={`bg-white outline-none ${drawer ? 'h-full w-full max-w-[420px] flex flex-col shadow-2xl' : sheet ? 'rounded-t-3xl md:rounded-2xl' : 'rounded-2xl'} ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
