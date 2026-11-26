'use client';

import { Languages } from 'lucide-react';
import { useAppLocale, type Locale } from '@/components/ui/i18n-provider';

const LOCALE_OPTIONS: Array<{ value: Locale; label: string; compactLabel: string }> = [
  { value: 'en', label: 'English', compactLabel: 'EN' },
  { value: 'hi', label: 'हिन्दी (Hindi)', compactLabel: 'हिन्दी' },
  { value: 'ta', label: 'தமிழ் (Tamil)', compactLabel: 'தமிழ்' },
  { value: 'te', label: 'తెలుగు (Telugu)', compactLabel: 'తెలుగు' },
  { value: 'ml', label: 'മലയാളം (Malayalam)', compactLabel: 'മലയാളം' },
  { value: 'kn', label: 'ಕನ್ನಡ (Kannada)', compactLabel: 'ಕನ್ನಡ' },
];

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useAppLocale();

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-semibold ${
        compact ? 'w-fit max-w-[116px] min-h-[34px] bg-white' : 'w-full min-h-[38px]'
      }`}
    >
      <Languages className="w-3.5 h-3.5 text-amber-deep shrink-0" aria-hidden="true" />
      <select
        aria-label="Language"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="w-full min-w-0 bg-transparent text-ink text-xs font-semibold focus:outline-none cursor-pointer truncate"
      >
        {LOCALE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {compact ? opt.compactLabel : opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
