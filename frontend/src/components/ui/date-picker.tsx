'use client';

import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const WIDTH = 304;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');
/** 2026-10-31, in the viewer's own time zone (never shifted by UTC) */
export const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseYmd(v?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null; // rejects 2026-02-31
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const shown = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const spoken = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthTitle = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

interface DatePickerProps {
  label?: string;
  /** yyyy-mm-dd, the same format a native date input uses, or '' for no date */
  value: string;
  onChange: (value: string) => void;
  /** earliest and latest choosable day, yyyy-mm-dd */
  min?: string;
  max?: string;
  placeholder?: string;
  /** a required date has no Clear button */
  required?: boolean;
  error?: string;
  id?: string;
  className?: string;
}

/**
 * A calm calendar for picking one day. It opens under its field (rendered into <body>, so a dialog's
 * scrolling can't clip it) and works from the keyboard: arrows move by day or week, PageUp/PageDown by
 * month, Enter picks, Escape closes it without closing a dialog around it.
 */
export function DatePicker({ label, value, onChange, min, max, placeholder = 'Select a date', required, error, id, className = '' }: DatePickerProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const selected = parseYmd(value);
  const minDate = parseYmd(min);
  const maxDate = parseYmd(max);
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? minDate ?? today));
  const [focusDate, setFocusDate] = useState<Date>(() => selected ?? minDate ?? today);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const outOfRange = (d: Date) => (!!minDate && d < minDate) || (!!maxDate && d > maxDate);
  const clamp = (d: Date) => (minDate && d < minDate ? minDate : maxDate && d > maxDate ? maxDate : d);

  const openPicker = () => {
    const start = clamp(selected ?? today);
    setFocusDate(start);
    setViewMonth(startOfMonth(start));
    setMode('days');
    setOpen(true);
  };

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const choose = (d: Date) => {
    if (outOfRange(d)) return;
    onChange(toYmd(d));
    close();
  };

  const moveFocus = (d: Date) => {
    const next = clamp(d);
    setFocusDate(next);
    setViewMonth(startOfMonth(next));
  };

  // Place it under the field, or above when there is no room below.
  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    if (!t) return;
    const height = popRef.current?.offsetHeight ?? 380;
    const left = Math.max(8, Math.min(t.left, window.innerWidth - WIDTH - 8));
    const below = t.bottom + 6;
    const top = below + height > window.innerHeight && t.top - height - 6 > 8 ? t.top - height - 6 : below;
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, mode, viewMonth, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as Node;
      if (!popRef.current?.contains(el) && !triggerRef.current?.contains(el)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place, close]);

  // Keyboard focus follows the highlighted day, and lands on it when the calendar opens.
  const focusKey = toYmd(focusDate);
  useEffect(() => {
    if (open && mode === 'days') popRef.current?.querySelector<HTMLElement>(`[data-date="${focusKey}"]`)?.focus();
  }, [open, mode, focusKey]);

  const onPopoverKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation(); // keys here belong to the calendar, not to a dialog around the field
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { close(); return; } // focus goes back to the field and Tab carries on from there
    if (mode !== 'days' || !(e.target as HTMLElement).dataset.date) return;
    const step: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focusDate, -1),
      ArrowRight: () => addDays(focusDate, 1),
      ArrowUp: () => addDays(focusDate, -7),
      ArrowDown: () => addDays(focusDate, 7),
      PageUp: () => addMonths(focusDate, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focusDate, e.shiftKey ? 12 : 1),
      Home: () => addDays(focusDate, -focusDate.getDay()),
      End: () => addDays(focusDate, 6 - focusDate.getDay()),
    };
    if (step[e.key]) { e.preventDefault(); moveFocus(step[e.key]()); }
  };

  // The month being shown, as six rows of seven (blank where the neighbouring month would be).
  const lead = viewMonth.getDay();
  const daysInMonth = endOfMonth(viewMonth).getDate();
  const cells: (Date | null)[] = Array.from({ length: 42 }, (_, i) => {
    const day = i - lead + 1;
    return day >= 1 && day <= daysInMonth ? new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day) : null;
  });
  const tabbable = focusDate.getFullYear() === viewMonth.getFullYear() && focusDate.getMonth() === viewMonth.getMonth()
    ? focusKey
    : toYmd(cells.find((d): d is Date => !!d && !outOfRange(d)) ?? viewMonth);

  const prevDisabled = !!minDate && endOfMonth(addMonths(viewMonth, -1)) < minDate;
  const nextDisabled = !!maxDate && startOfMonth(addMonths(viewMonth, 1)) > maxDate;
  const navButton = 'p-2 rounded-full text-ink-soft hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label id={`${fieldId}-label`} htmlFor={fieldId} className="text-sm font-medium text-ink-soft">{label}</label>}
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        aria-haspopup="dialog"
        aria-labelledby={label ? `${fieldId}-label ${fieldId}-value` : undefined} // read out as "Check-in 15 Oct 2026", not just "Check-in"
        aria-expanded={open}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        onClick={() => (open ? close(false) : openPicker())}
        className={`w-full px-4 py-3 flex items-center justify-between gap-2 text-left bg-white border-2 rounded-xl transition-all duration-200 focus:border-amber focus:outline-none focus:ring-4 focus:ring-amber/10 ${error ? 'border-terra' : 'border-stone-200'}`}
      >
        <span id={`${fieldId}-value`} className={selected ? 'text-ink' : 'text-stone-400'}>{selected ? shown.format(selected) : placeholder}</span>
        <CalendarDays className="w-5 h-5 text-ink-muted shrink-0" aria-hidden="true" />
      </button>
      {error && <p id={`${fieldId}-error`} role="alert" className="text-sm text-terra">{error}</p>}

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={label ? `Choose ${label.replace(/\s*\*$/, '').toLowerCase()}` : 'Choose a date'}
          onKeyDown={onPopoverKey}
          style={{ top: pos.top, left: pos.left, width: WIDTH }}
          className="fixed z-[120] bg-white border border-stone-200 rounded-2xl shadow-2xl p-4"
        >
          {mode === 'days' ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <button type="button" aria-label="Previous month" disabled={prevDisabled} onClick={() => setViewMonth(addMonths(viewMonth, -1))} className={navButton}><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
                <button type="button" onClick={() => setMode('months')} aria-label={`${monthTitle.format(viewMonth)}, choose month or year`} className="flex items-center gap-1 px-2 py-1 rounded-lg font-semibold text-ink hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
                  <span aria-live="polite">{monthTitle.format(viewMonth)}</span>
                  <ChevronDown className="w-4 h-4 text-ink-muted" aria-hidden="true" />
                </button>
                <button type="button" aria-label="Next month" disabled={nextDisabled} onClick={() => setViewMonth(addMonths(viewMonth, 1))} className={navButton}><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
              </div>

              <div role="grid" aria-label={monthTitle.format(viewMonth)}>
                <div role="row" className="grid grid-cols-7 mb-1">
                  {WEEKDAYS.map(w => <div key={w} role="columnheader" className="text-center text-xs font-medium text-ink-muted py-1">{w}</div>)}
                </div>
                {Array.from({ length: 6 }, (_, row) => (
                  <div key={row} role="row" className="grid grid-cols-7">
                    {cells.slice(row * 7, row * 7 + 7).map((d, i) => {
                      if (!d) return <div key={i} role="gridcell" className="h-10" />;
                      const key = toYmd(d);
                      const isSelected = !!selected && key === toYmd(selected);
                      const isToday = key === toYmd(today);
                      const disabled = outOfRange(d);
                      return (
                        <div key={i} role="gridcell" className="flex justify-center">
                          <button
                            type="button"
                            data-date={key}
                            tabIndex={key === tabbable ? 0 : -1}
                            disabled={disabled}
                            aria-label={spoken.format(d)}
                            aria-pressed={isSelected}
                            aria-current={isToday ? 'date' : undefined}
                            onClick={() => choose(d)}
                            className={`w-10 h-10 rounded-full text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber ${
                              isSelected ? 'bg-amber text-white font-semibold'
                                : disabled ? 'text-stone-300 cursor-not-allowed'
                                : isToday ? 'text-amber-deep font-semibold ring-1 ring-amber hover:bg-amber-pale'
                                : 'text-ink hover:bg-stone-100'
                            }`}
                          >
                            {d.getDate()}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-200 text-sm">
                <button type="button" disabled={outOfRange(today)} onClick={() => choose(today)} className="px-2 py-1 rounded-lg font-medium text-amber-deep hover:bg-amber-pale disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">Today</button>
                {!required && selected && (
                  <button type="button" onClick={() => { onChange(''); close(); }} className="px-2 py-1 rounded-lg font-medium text-ink-muted hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">Clear</button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <button type="button" aria-label="Previous year" onClick={() => setViewMonth(addMonths(viewMonth, -12))} className={navButton}><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
                <span className="font-semibold text-ink" aria-live="polite">{viewMonth.getFullYear()}</span>
                <button type="button" aria-label="Next year" onClick={() => setViewMonth(addMonths(viewMonth, 12))} className={navButton}><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((m, idx) => {
                  const first = new Date(viewMonth.getFullYear(), idx, 1);
                  const disabled = (!!minDate && endOfMonth(first) < minDate) || (!!maxDate && first > maxDate);
                  const current = idx === viewMonth.getMonth();
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={disabled}
                      aria-pressed={current}
                      onClick={() => { setMode('days'); moveFocus(new Date(first.getFullYear(), idx, Math.min(focusDate.getDate(), endOfMonth(first).getDate()))); }}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${current ? 'bg-amber text-white' : disabled ? 'text-stone-300 cursor-not-allowed' : 'text-ink hover:bg-stone-100'}`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
