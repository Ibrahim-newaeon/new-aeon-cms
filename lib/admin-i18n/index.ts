// lib/admin-i18n/index.ts
import { ar, en, type AdminLocale, type MessageKey } from './messages';

export type { AdminLocale, MessageKey };
export const ADMIN_LOCALE_COOKIE = 'admin_locale';
export const adminLocales: ReadonlyArray<AdminLocale> = ['ar', 'en'];

export function isAdminLocale(v: unknown): v is AdminLocale {
  return v === 'ar' || v === 'en';
}

export function dirFor(locale: AdminLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Resolves a key, falling back to Arabic when the English catalogue has no
 * entry yet. That keeps the panel usable mid-translation instead of leaking
 * raw keys into the UI.
 *
 * `{placeholder}` tokens are substituted from `vars`.
 */
export function translate(
  locale: AdminLocale,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const value = (locale === 'en' ? en[key] : undefined) ?? ar[key] ?? key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m
  );
}

export type Translator = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function createTranslator(locale: AdminLocale): Translator {
  return (key, vars) => translate(locale, key, vars);
}
