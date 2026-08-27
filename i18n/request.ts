// i18n/request.ts
// next-intl looks for this path by default. The previous lib/i18n/config.ts was
// never referenced by anything, so getMessages() had no config and the build
// reported "Couldn't find next-intl config file".
import { getRequestConfig } from 'next-intl/server';
import { locales, env } from '@/lib/env';
import type { Locale } from '@/lib/env';

export default getRequestConfig(async ({ requestLocale }) => {
  // next-intl v3.22+: `locale` is deprecated in favour of awaiting
  // requestLocale, which is undefined on non-localized routes.
  const requested = await requestLocale;
  const locale: Locale = locales.includes(requested as Locale)
    ? (requested as Locale)
    : env.DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
