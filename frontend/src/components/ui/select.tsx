'use client';

import { SelectHTMLAttributes, forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  /** Shown when the current value matches none of the options. */
  placeholder?: string;
}

const LIST_MAX_HEIGHT = 256;

/**
 * A styled dropdown. The real <select> stays in the page (hidden) so forms, refs, labels and `onChange`
 * events behave exactly as before; the visible button and list are a nicer face on top of it.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, placeholder = 'Select…', value, defaultValue, onChange, disabled, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const listId = `${fieldId}-list`;

    const selectRef = useRef<HTMLSelectElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => selectRef.current as HTMLSelectElement);

    const [open, setOpen] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const [active, setActive] = useState(0);
    const [internal, setInternal] = useState(defaultValue !== undefined ? String(defaultValue) : '');

    const current = value !== undefined ? String(value) : internal;
    const selectedIndex = options.findIndex((o) => o.value === current);
    const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

    const openList = useCallback(() => {
      if (disabled || options.length === 0) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      setOpenUp(!!rect && window.innerHeight - rect.bottom < LIST_MAX_HEIGHT + 16 && rect.top > window.innerHeight - rect.bottom);
      setActive(selectedIndex >= 0 ? selectedIndex : 0);
      setOpen(true);
    }, [disabled, options.length, selectedIndex]);

    const closeList = useCallback((refocus = true) => {
      setOpen(false);
      if (refocus) triggerRef.current?.focus();
    }, []);

    const choose = (index: number) => {
      const next = options[index];
      if (!next) return;
      const el = selectRef.current;
      if (el && el.value !== next.value) {
        // Drive the hidden <select> so the caller's onChange receives a genuine change event.
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(el, next.value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (value === undefined) setInternal(next.value);
      closeList();
    };

    // Close when clicking elsewhere.
    useEffect(() => {
      if (!open) return;
      const onDown = (e: MouseEvent) => {
        if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // Keep the highlighted option in view while arrowing through a long list.
    useEffect(() => {
      if (!open) return;
      document.getElementById(`${fieldId}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' });
    }, [open, active, fieldId]);

    const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const last = options.length - 1;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!open) openList();
          else setActive((a) => Math.min(a + 1, last));
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!open) openList();
          else setActive((a) => Math.max(a - 1, 0));
          break;
        case 'Home':
          if (open) { e.preventDefault(); setActive(0); }
          break;
        case 'End':
          if (open) { e.preventDefault(); setActive(last); }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!open) openList();
          else choose(active);
          break;
        case 'Escape':
          if (open) { e.preventDefault(); e.stopPropagation(); closeList(); }
          break;
        case 'Tab':
          if (open) setOpen(false);
          break;
        default:
          // Type a letter to jump to the next option starting with it.
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const ch = e.key.toLowerCase();
            const from = open ? active + 1 : Math.max(selectedIndex, -1) + 1;
            const order = [...options.keys()].map((i) => (i + from) % options.length);
            const hit = order.find((i) => options[i].label.toLowerCase().startsWith(ch));
            if (hit !== undefined) {
              if (open) setActive(hit);
              else choose(hit);
            }
          }
      }
    };

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={fieldId}
            // The hidden <select> carries the label for forms; clicking it should land on the visible button.
            onClick={(e) => { e.preventDefault(); triggerRef.current?.focus(); }}
            className="text-sm font-medium text-ink-soft transition-colors"
          >
            {label}
          </label>
        )}

        <div ref={wrapRef} className="relative">
          <select
            ref={selectRef}
            id={fieldId}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            disabled={disabled}
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            {...props}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button
            ref={triggerRef}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open ? `${fieldId}-opt-${active}` : undefined}
            aria-label={label ? `${label}: ${selected?.label ?? placeholder}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            disabled={disabled}
            onClick={() => (open ? closeList(false) : openList())}
            onKeyDown={onKeyDown}
            className={`
              w-full px-4 py-3 flex items-center justify-between gap-3 text-left
              bg-white border-2 border-stone-200 rounded-xl
              transition-all duration-200
              hover:border-stone-300
              focus:border-amber focus:outline-none focus:ring-4 focus:ring-amber/10
              disabled:opacity-50 disabled:cursor-not-allowed
              ${open ? 'border-amber ring-4 ring-amber/10' : ''}
              ${error ? 'border-terra focus:border-terra focus:ring-terra/10' : ''}
              ${className}
            `}
          >
            <span className={`truncate ${selected ? 'text-ink' : 'text-ink-muted'}`}>{selected?.label ?? placeholder}</span>
            <ChevronDown aria-hidden="true" className={`w-4 h-4 shrink-0 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {open && (
              <motion.ul
                id={listId}
                role="listbox"
                aria-label={label ? `${label} options` : undefined}
                initial={{ opacity: 0, y: openUp ? 4 : -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                style={{ maxHeight: LIST_MAX_HEIGHT }}
                className={`absolute left-0 right-0 z-50 overflow-y-auto p-1.5 bg-white border border-stone-200 rounded-xl shadow-xl ${openUp ? 'bottom-full mb-2' : 'top-full mt-2'}`}
              >
                {options.map((o, i) => {
                  const isSelected = i === selectedIndex;
                  return (
                    <li
                      key={o.value}
                      id={`${fieldId}-opt-${i}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(i)}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm ${
                        i === active ? 'bg-amber-pale' : ''
                      } ${isSelected ? 'font-semibold text-amber-deep' : 'text-ink'}`}
                    >
                      <span className="truncate">{o.label}</span>
                      {isSelected && <Check aria-hidden="true" className="w-4 h-4 shrink-0" />}
                    </li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>

          {error && (
            <p id={`${fieldId}-error`} role="alert" className="text-sm text-terra mt-1">{error}</p>
          )}
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';
