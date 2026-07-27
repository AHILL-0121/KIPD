'use client';

import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'amber' | 'terra' | 'sage' | 'stone';
  dot?: boolean;
  className?: string;
}

export function Badge({ children, variant = 'amber', dot = false, className = '' }: BadgeProps) {
  const variantClasses = {
    amber: 'bg-amber-pale text-amber-deep',
    terra: 'bg-terra-pale text-terra',
    sage: 'bg-sage-pale text-sage',
    stone: 'bg-stone-100 text-stone-500',
  };

  return (
    <span 
      className={`
        inline-flex items-center gap-1.5 
        px-3 py-1 rounded-full
        text-xs font-medium uppercase tracking-wide
        transition-transform hover:scale-105
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
