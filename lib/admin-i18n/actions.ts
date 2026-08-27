// lib/admin-i18n/actions.ts
'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ADMIN_LOCALE_COOKIE, isAdminLocale } from './index';

/**
 * A Server Action rather than an API route: this only writes a UI-preference
 * cookie, so it needs no JSON endpoint, and Next handles CSRF for actions.
 */
export async function setAdminLocale(locale: string) {
  if (!isAdminLocale(locale)) return;

  const store = await cookies();
  store.set(ADMIN_LOCALE_COOKIE, locale, {
    httpOnly: false, // read by no JS today, but harmless and easier to debug
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  // The whole admin tree is server-rendered with these strings.
  revalidatePath('/', 'layout');
}
