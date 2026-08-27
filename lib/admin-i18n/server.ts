// lib/admin-i18n/server.ts
import 'server-only';
import { cookies } from 'next/headers';
import { ADMIN_LOCALE_COOKIE, isAdminLocale, type AdminLocale } from './index';

/**
 * Admin locale comes from a cookie rather than the URL: the admin has no
 * /[locale] segment, and adding one would break every existing ADMIN_PATH link.
 */
export async function getAdminLocale(): Promise<AdminLocale> {
  const store = await cookies();
  const value = store.get(ADMIN_LOCALE_COOKIE)?.value;
  if (isAdminLocale(value)) return value;

  const fallback = process.env.DEFAULT_LOCALE;
  return isAdminLocale(fallback) ? fallback : 'ar';
}
