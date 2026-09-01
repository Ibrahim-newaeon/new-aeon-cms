// app/(auth)/layout.tsx
// ROOT layout for unauthenticated admin screens (login, password reset).
//
// These CANNOT live in the (admin) group: that group's layout redirects to
// /admin/login whenever there is no valid session, so the login page itself
// would redirect to itself forever.
import type { Metadata } from 'next';
import { Cairo, Inter } from 'next/font/google';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { dirFor } from '@/lib/admin-i18n';
import { AdminI18nProvider } from '@/components/admin/i18n-provider';
import { createTranslator } from '@/lib/admin-i18n';
import { getSettings } from '@/lib/db/queries';
import { adminBrandCss } from '@/lib/theme/admin-brand';
import { redirect } from 'next/navigation';
import { needsSetup } from '@/lib/setup/status';
import '../globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

/**
 * generateMetadata rather than a constant: the title was a hardcoded Arabic
 * string, so an English-locale admin still got an Arabic tab — and it named no
 * site at all, which on a white-labelled install is the first thing a client
 * sees.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([getSettings(), getAdminLocale()]);
  const t = createTranslator(locale);
  const title = t('auth.signIn');

  return {
    title: settings?.siteName ? `${settings.siteName} — ${title}` : title,
    robots: { index: false, follow: false },
  };
}

/**
 * Never prerendered.
 *
 * This shell is authenticated and reads the database on every request, so a
 * static copy of it could never be correct. It USED to be treated as dynamic
 * only incidentally — the first thing it did was call cookies(), which Next
 * takes as the signal. Adding the setup check in front of that put a database
 * query before the signal, and `next build` began trying to prerender /admin
 * against a database it could not reach.
 *
 * Stated explicitly so the behaviour no longer depends on the order of two
 * unrelated lines.
 */
export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Same reason as the admin layout: a login form is useless before any
  // account exists, and offering one reads as the deploy having failed.
  if (await needsSetup()) redirect('/setup');

  const [locale, settings] = await Promise.all([getAdminLocale(), getSettings()]);

  // The login screen is branded too: it is the only page a locked-out client
  // sees, and ours would be the wrong logo on it.
  const adminCss = adminBrandCss(settings?.adminAccent);

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${cairo.variable} ${inter.variable} h-full`}
    >
      <body className="min-h-full bg-[var(--admin-bg)] text-[var(--admin-text)] antialiased">
        {adminCss && <style dangerouslySetInnerHTML={{ __html: adminCss }} />}
        <AdminI18nProvider locale={locale}>{children}</AdminI18nProvider>
      </body>
    </html>
  );
}
