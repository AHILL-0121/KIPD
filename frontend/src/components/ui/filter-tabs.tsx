'use client';

interface FilterTab {
  value: string;
  label: string;
  count: number;
}

/** A row of filters with how many each holds, like the status tabs in the design sample. */
export function FilterTabs({ tabs, value, onChange, label }: { tabs: FilterTab[]; value: string; onChange: (value: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-stone-100">
      {tabs.map(t => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.value)}
            className={`h-10 px-3.5 rounded-lg inline-flex items-center gap-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${on ? 'bg-white text-ink font-semibold shadow-sm' : 'text-ink-soft font-medium hover:text-ink'}`}
          >
            {t.label}
            <span className="text-xs font-semibold text-ink-muted bg-white rounded-full px-2 py-px">{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}
