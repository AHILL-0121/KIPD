import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const SUPPORTED_LOCALES = ['en', 'hi', 'ta', 'te', 'ml', 'kn'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_COOKIE = 'kipd-locale';

export default getRequestConfig(async () => {
  let locale: SupportedLocale = 'en';
  try {
    const c = cookies().get(LOCALE_COOKIE)?.value;
    if (c && (SUPPORTED_LOCALES as readonly string[]).includes(c)) {
      locale = c as SupportedLocale;
    }
  } catch {
    locale = 'en';
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
