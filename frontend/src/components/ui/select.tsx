'use client';

import { SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-ink-soft transition-colors">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`
              w-full px-4 py-3 
              bg-white border-2 border-stone-200 rounded-xl
              text-ink appearance-none
              transition-all duration-200
              focus:border-amber focus:outline-none focus:ring-4 focus:ring-amber/10
              focus:-translate-y-0.5
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? 'border-terra focus:border-terra focus:ring-terra/10' : ''}
              ${className}
            `}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
              <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          {error && (
            <p className="text-sm text-terra mt-1">{error}</p>
          )}
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';
