'use client';

import * as React from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export interface ToastProps {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactElement;
  variant?: 'default' | 'success' | 'error' | 'info';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export type ToastActionElement = React.ReactElement;

export function Toast({ 
  variant = 'default', 
  title, 
  description, 
  action,
  onOpenChange 
}: ToastProps) {
  const variantStyles = {
    success: 'border-sage bg-sage-pale text-ink',
    error: 'border-terra bg-terra-pale text-ink',
    info: 'border-amber bg-amber-pale text-ink',
    default: 'border-stone-300 bg-canvas text-ink',
  };

  return (
    <div
      className={`
        pointer-events-auto relative flex w-full items-center justify-between 
        space-x-4 overflow-hidden rounded-2xl border-2 p-6 pr-8 shadow-lg
        transition-all animate-in slide-in-from-top-full
        ${variantStyles[variant]}
      `}
    >
      <div className="flex items-start gap-3 w-full">
        {getToastIcon(variant)}
        <div className="flex-1 grid gap-1">
          {title && <div className="text-base font-bold text-ink">{title}</div>}
          {description && <div className="text-sm text-ink-muted mt-1">{description}</div>}
        </div>
      </div>
      {action}
      <button
        onClick={() => onOpenChange?.(false)}
        className="absolute right-2 top-2 rounded-md p-1 text-ink-muted opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function ToastViewport({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed top-0 right-0 z-[100] flex max-h-screen w-full flex-col p-4 sm:bottom-0 sm:top-auto sm:flex-col md:max-w-[420px]">
      {children}
    </div>
  );
}

export const ToastTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="text-base font-bold text-ink">{children}</div>
);

export const ToastDescription = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm text-ink-muted mt-1">{children}</div>
);

export const ToastClose = ({ onClick }: { onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className="absolute right-2 top-2 rounded-md p-1 text-ink-muted opacity-60 transition-opacity hover:opacity-100"
  >
    <X className="h-4 w-4" />
  </button>
);

export const ToastAction = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
  <button
    onClick={onClick}
    className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-stone-300 bg-transparent px-3 text-sm font-medium transition-colors hover:bg-stone-100"
  >
    {children}
  </button>
);

export const getToastIcon = (variant?: string) => {
  switch (variant) {
    case 'success':
      return <CheckCircle2 className="h-5 w-5 text-sage shrink-0" />;
    case 'error':
      return <AlertCircle className="h-5 w-5 text-terra shrink-0" />;
    case 'info':
      return <Info className="h-5 w-5 text-amber shrink-0" />;
    default:
      return <Info className="h-5 w-5 text-ink-muted shrink-0" />;
  }
};
