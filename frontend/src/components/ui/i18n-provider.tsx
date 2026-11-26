'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../../../messages/en.json';
import hiMessages from '../../../messages/hi.json';
import taMessages from '../../../messages/ta.json';
import teMessages from '../../../messages/te.json';
import mlMessages from '../../../messages/ml.json';
import knMessages from '../../../messages/kn.json';

export const SUPPORTED_LOCALES = ['en', 'hi', 'ta', 'te', 'ml', 'kn'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type AppMessages = typeof enMessages;
const LOCALE_STORAGE_KEY = 'kipd-locale';

const MESSAGES: Record<Locale, AppMessages> = {
  en: enMessages,
  hi: hiMessages,
  ta: taMessages,
  te: teMessages,
  ml: mlMessages,
  kn: knMessages,
};

function isSupportedLocale(value: string | null | undefined): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '');
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  messages: AppMessages;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  messages: enMessages,
});

export function useAppLocale() {
  return useContext(LocaleContext);
}

/**
 * Returns the active typed translation catalog (defaults to English when used outside I18nProvider, e.g. unit tests).
 */
export function useAppMessages(): AppMessages {
  return useContext(LocaleContext).messages;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isSupportedLocale(saved)) {
        setLocaleState(saved);
        if (typeof document !== 'undefined') document.documentElement.lang = saved;
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof document !== 'undefined') document.documentElement.lang = next;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
      document.cookie = `${LOCALE_STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      /* ignore */
    }
  };

  const messages = MESSAGES[locale];

  return (
    <LocaleContext.Provider value={{ locale, setLocale, messages }}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
