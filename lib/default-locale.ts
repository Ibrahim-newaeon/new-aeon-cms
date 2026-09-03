// lib/default-locale.ts
import 'server-only';
import { cache } from 'react';
import { getSettings } from '@/lib/db/queries';
import { env, locales, type Locale } from '@/lib/env';

/**
 * The storefront's primary language.
 *
 * ── Why this is not just `env.DEFAULT_LOCALE` ───────────────────────────────
 * The setup wizard asks the operator to choose one. Until now the answer was
 * validated, posted, and dropped on the floor — nothing wrote it, and every
 * reader used the environment variable instead, so an operator who picked
 * English got an Arabic site and no way to tell why. A wizard field that
 * discards its answer is worse than no field.
 *
 * ── Why the environment variable still wins when the column is null ─────────
 * Null means "this site never chose", which is true of every install that
 * predates the column. Those sites are configured entirely by DEFAULT_LOCALE
 * and must keep behaving identically; defaulting the column to 'ar' would have
 * silently flipped an English deployment on its next migration.
 *
 * ── Why the value is re-validated ───────────────────────────────────────────
 * AVAILABLE_LOCALES is deploy-time config and the column is data. A site whose
 * locales were later narrowed to `ar` could otherwise hold 'en' here and send
 * every visitor to a route that does not exist.
 *
 * Cached per request: the root redirect, the metadata builder and the layout
 * can all ask without turning one page view into three identical queries.
 */
export const getDefaultLocale = cache(async (): Promise<Locale> => {
  try {
    const settings = await getSettings();
    const chosen = settings?.defaultLocale;
    if (chosen && locales.includes(chosen as Locale)) return chosen as Locale;
  } catch {
    // A storefront that cannot reach its database has bigger problems than
    // which language it opens in, but it must not fail *here* — this runs in
    // the root redirect, which is the first thing a new deploy is asked for.
  }
  return env.DEFAULT_LOCALE;
});
