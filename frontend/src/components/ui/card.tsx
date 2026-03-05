'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', hover = true, onClick }: CardProps) {
  const Component = hover ? motion.div : 'div';
  
  const props = hover ? {
    whileHover: { y: -8, scale: 1.02 },
    transition: { type: 'spring', stiffness: 300 }
  } : {};

  return (
    <Component
      className={`
        bg-white rounded-2xl p-6 shadow-md
        border border-stone-200
        transition-shadow duration-300
        ${hover ? 'hover:shadow-xl cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
      {...props}
    >
      {children}
    </Component>
  );
}

interface CardIconProps {
  children: ReactNode;
  variant?: 'amber' | 'terra' | 'sage' | 'stone';
}

export function CardIcon({ children, variant = 'amber' }: CardIconProps) {
  const variantClasses = {
    amber: 'bg-amber-pale text-amber-deep',
    terra: 'bg-terra-pale text-terra',
    sage: 'bg-sage-pale text-sage',
    stone: 'bg-stone-100 text-stone-500',
  };

  return (
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${variantClasses[variant]} mb-4`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`font-serif text-lg font-semibold text-ink ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-ink-muted mt-2 leading-relaxed ${className}`}>{children}</p>;
}
