// app/(setup)/layout.tsx
//
// ROOT layout for the first-run wizard.
//
// It cannot live in the (admin) group: that layout redirects anyone without a
// session to /admin/login, and on a fresh install there is no account to log in
// with — the wizard would bounce to a form that can never succeed. Same reason
// the auth group is separate.
import type { Metadata } from 'next';
import { Cairo, Inter } from 'next/font/google';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { dirFor, createTranslator } from '@/lib/admin-i18n';
import { AdminI18nProvider } from '@/components/admin/i18n-provider';
import '../globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getAdminLocale());
  return { title: t('setup.title'), robots: { index: false, follow: false } };
}

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const locale = await getAdminLocale();

  return (
    <html lang={locale} dir={dirFor(locale)} className={`${cairo.variable} ${inter.variable} h-full`}>
      <body className="min-h-full bg-[var(--admin-bg)] text-[var(--admin-text)] antialiased">
        <AdminI18nProvider locale={locale}>{children}</AdminI18nProvider>
      </body>
    </html>
  );
}
