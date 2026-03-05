'use client';

import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-ink-soft transition-colors">
            {label}
          </label>
        )}
        <div className="relative">
          <textarea
            ref={ref}
            className={`
              w-full px-4 py-3 
              bg-white border-2 border-stone-200 rounded-xl
              text-ink placeholder:text-stone-400
              transition-all duration-200
              focus:border-amber focus:outline-none focus:ring-4 focus:ring-amber/10
              focus:-translate-y-0.5
              disabled:opacity-50 disabled:cursor-not-allowed
              resize-vertical min-h-[100px]
              ${error ? 'border-terra focus:border-terra focus:ring-terra/10' : ''}
              ${className}
            `}
            {...props}
          />
          {error && (
            <p className="text-sm text-terra mt-1">{error}</p>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
