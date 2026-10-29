'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

interface HoldButtonProps {
  onConfirm: () => void;
  children: ReactNode;
  /** How long to hold, in milliseconds. */
  duration?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Press and hold to confirm, for the one action that should never happen by accident
 * (accepting a new kitchen order). Works with a finger, a mouse, or holding Space / Enter.
 * Letting go early cancels. With reduced motion the bar jumps instead of sliding, but the hold still applies.
 */
export function HoldButton({ onConfirm, children, duration = 700, disabled, className = '' }: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const started = useRef<number | null>(null);
  const done = useRef(false);
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    started.current = null;
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (started.current === null) return;
    const p = Math.min(1, (performance.now() - started.current) / duration);
    setProgress(p);
    if (p >= 1) {
      done.current = true;
      stop();
      confirmRef.current();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }, [duration, stop]);

  const start = useCallback(() => {
    if (disabled || started.current !== null || done.current) return;
    started.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  const release = useCallback(() => { done.current = false; stop(); }, [stop]);
  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start(); }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') release(); }}
      onBlur={release}
      onContextMenu={(e) => e.preventDefault()}
      aria-describedby={undefined}
      className={`relative select-none touch-none overflow-hidden rounded-lg bg-amber px-6 py-4 text-lg font-semibold text-white hover:bg-amber-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-white/30 motion-reduce:transition-none"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative flex flex-col items-center leading-tight">
        <span>{children}</span>
        <span className="text-xs font-normal opacity-90">Press and hold</span>
      </span>
    </button>
  );
}
