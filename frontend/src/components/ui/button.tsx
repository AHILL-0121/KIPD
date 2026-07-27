'use client';

import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { Slot } from '@radix-ui/react-slot';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  variant?: 'primary' | 'ghost' | 'terra' | 'sage';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  asChild?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', isLoading, asChild = false, className = '', ...props }, ref) => {
    const baseClasses = 'inline-flex items-center gap-2 font-medium rounded-xl transition-all duration-300 relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variantClasses = {
      primary: 'bg-amber text-ink shadow-[0_4px_16px_rgba(232,160,32,0.35)] hover:shadow-[0_8px_28px_rgba(232,160,32,0.45)] hover:-translate-y-0.5',
      ghost: 'bg-transparent text-ink-soft border-[1.5px] border-stone-200 hover:bg-stone-100 hover:border-stone-300',
      terra: 'bg-terra text-white shadow-[0_4px_16px_rgba(200,87,58,0.3)] hover:shadow-[0_8px_28px_rgba(200,87,58,0.4)] hover:-translate-y-0.5',
      sage: 'bg-sage text-white shadow-[0_4px_16px_rgba(94,140,106,0.3)] hover:shadow-[0_8px_28px_rgba(94,140,106,0.4)] hover:-translate-y-0.5',
    };
    
    const sizeClasses = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    };

    const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

    if (asChild) {
      return (
        <Slot className={classes}>
          {children}
        </Slot>
      );
    }

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={classes}
        disabled={isLoading || props.disabled}
        {...props}
      >
        <span className="relative z-10 flex items-center gap-2">
          {isLoading && (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {children}
        </span>
        <span className="absolute inset-0 bg-white opacity-0 hover:opacity-20 transition-opacity" />
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
