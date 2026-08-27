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
import '../globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
  robots: { index: false, follow: false },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getAdminLocale();

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${cairo.variable} ${inter.variable} h-full`}
    >
      <body className="min-h-full bg-[var(--admin-bg)] text-[var(--admin-text)] antialiased">
        <AdminI18nProvider locale={locale}>{children}</AdminI18nProvider>
      </body>
    </html>
  );
}
