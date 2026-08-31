// app/(admin)/layout.tsx
// ROOT layout for the admin application. See the sibling site layout for why
// each route group owns its own <html>.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Cairo, Inter } from 'next/font/google';
import { verifyAccessToken } from '@/lib/auth/session';
import { AdminShell } from '@/components/admin/shell';
import { getSettings } from '@/lib/db/queries';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { dirFor, createTranslator } from '@/lib/admin-i18n';
import { AdminI18nProvider } from '@/components/admin/i18n-provider';
import { SessionKeeper } from '@/components/admin/session-keeper';
import '../globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

import { adminBrandCss } from '@/lib/theme/admin-brand';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

// generateMetadata rather than a static object: the title has to follow the
// admin locale cookie, which a module-level constant cannot read.
export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getAdminLocale());

  const settings = await getSettings();

  return {
    // The client's name, not ours: this is the browser tab and the bookmark.
    title: settings?.siteName
      ? `${settings.siteName} — ${t('brand.panelTitle')}`
      : t('brand.panelTitle'),
    // The admin panel must never be indexed.
    robots: { index: false, follow: false },
  };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  // redirect() throws NEXT_REDIRECT, so it must stay OUTSIDE the try — a catch
  // would swallow it and the redirect would silently not happen.
  if (!accessToken) {
    redirect(`${ADMIN_PATH}/login`);
  }

  let payload;
  try {
    payload = await verifyAccessToken(accessToken);
  } catch {
    payload = null;
  }

  if (!payload) {
    redirect(`${ADMIN_PATH}/login`);
  }

  // Settings failure is a server error, not an auth failure. Previously a DB
  // outage here bounced the user to /login, which then also failed — an
  // apparently-broken login loop with no explanation.
  const [settings, locale] = await Promise.all([getSettings(), getAdminLocale()]);

  const adminCss = adminBrandCss(settings?.adminAccent);

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${cairo.variable} ${inter.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        {/*
          The client's accent, before anything renders. Emits nothing when the
          accent is unset or is already the default, so the common case adds no
          bytes. Only a validated six-digit hex reaches this, and style-src
          allows inline, so no nonce plumbing is needed here.
        */}
        {adminCss && <style dangerouslySetInnerHTML={{ __html: adminCss }} />}
        <SessionKeeper loginPath={`${ADMIN_PATH}/login`} />
        <AdminI18nProvider locale={locale}>
          <AdminShell
            user={{ name: payload.name, email: payload.email, role: payload.role }}
            siteName={settings?.siteName ?? 'CMS'}
            adminPath={ADMIN_PATH}
            eCommerceEnabled={settings?.eCommerceEnabled ?? false}
            // adminLogo, not logo: the storefront mark is drawn for a light
            // page and disappears on the near-black sidebar.
            logo={settings?.adminLogo}
          >
            {children}
          </AdminShell>
        </AdminI18nProvider>
      </body>
    </html>
  );
}
