// app/(site)/[locale]/layout.tsx
// ROOT layout for the public site. There is deliberately no app/layout.tsx:
// with a single root layout, `dir`/`lang` were pinned to Arabic for every
// locale. Route groups each owning a root layout is the supported way to vary
// the <html> element. (Navigating between the site and the admin group causes a
// full document load, which is fine — they are separate applications.)
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Cairo, Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { Navbar } from '@/components/site/navbar';
import { Footer } from '@/components/site/footer';
import { getNavigation, getSettings } from '@/lib/db/queries';
import { TrackingScripts, TrackingNoScript } from '@/components/site/tracking-scripts';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/session';
import { locales, type Locale } from '@/lib/env';
import '../../globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Site name comes from settings, never a hardcoded brand string.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: settings?.siteName ?? 'CMS',
    description: settings?.siteDescription ?? undefined,
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale as Locale)) {
    notFound();
  }
  const typedLocale = locale as Locale;

  // Required for next-intl static rendering; without it every page opts into
  // dynamic rendering.
  setRequestLocale(typedLocale);

  const [messages, headerNav, footerNav, settings, headerList] = await Promise.all([
    getMessages(),
    getNavigation('header', typedLocale),
    getNavigation('footer', typedLocale),
    getSettings(),
    headers(),
  ]);

  /*
   * Coming-soon gate.
   *
   * This lives in the layout, not middleware: the flag is a database value and
   * middleware runs on the Edge with no DB access. Signed-in staff bypass it so
   * the site can be reviewed before launch.
   */
  let staffPreview = false;
  if (settings?.comingSoonMode) {
    const token = (await cookies()).get('access_token')?.value;
    if (token) {
      try {
        await verifyAccessToken(token);
        staffPreview = true;
      } catch {
        staffPreview = false;
      }
    }
  }
  /*
   * redirect(), not a conditional render.
   *
   * Rendering the holding page instead of {children} keeps it out of the DOM,
   * but `children` has already been computed — the real content still ships
   * inside the RSC flight payload, visible in view-source. A redirect sends no
   * body at all.
   */
  if (settings?.comingSoonMode && !staffPreview) {
    redirect('/coming-soon');
  }

  const dir = typedLocale === 'ar' ? 'rtl' : 'ltr';
  const nonce = headerList.get('x-nonce') ?? undefined;

  return (
    <html lang={typedLocale} dir={dir} className={`${cairo.variable} ${inter.variable} h-full`}>
      <body className="min-h-full antialiased">
        {/* GTM requires its noscript iframe first inside <body>. */}
        <TrackingNoScript gtmId={settings?.gtmId} />
        <NextIntlClientProvider messages={messages} locale={typedLocale}>
          <div className="min-h-screen flex flex-col">
            {staffPreview && (
                <p className="bg-[var(--admin-accent,#ffc619)] px-4 py-2 text-center text-sm font-medium text-[#130c0e]">
                  وضع «قريباً» مفعّل — أنت ترى الموقع لأنك مسجّل الدخول. الزوار يرون صفحة الانتظار.
                </p>
              )}
            <Navbar
              navigation={headerNav}
              logo={settings?.logo ?? null}
              siteName={settings?.siteName ?? 'CMS'}
              locale={typedLocale}
            />
            <main className="flex-1">{children}</main>
            <Footer navigation={footerNav} settings={settings} locale={typedLocale} />
          </div>
        </NextIntlClientProvider>

        <TrackingScripts settings={settings} />

        {settings?.customCss && (
          <style nonce={nonce} dangerouslySetInnerHTML={{ __html: settings.customCss }} />
        )}
      </body>
    </html>
  );
}
