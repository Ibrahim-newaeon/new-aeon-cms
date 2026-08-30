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
import { themeToCss } from '@/lib/theme/slots';
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

  const themeCss = themeToCss(settings?.theme ?? null);


  return (
    <html lang={typedLocale} dir={dir} className={`${cairo.variable} ${inter.variable} h-full`}>
      <body className="min-h-full antialiased">
        {/* GTM requires its noscript iframe first inside <body>. */}
        <TrackingNoScript gtmId={settings?.gtmId} />
        <NextIntlClientProvider messages={messages} locale={typedLocale}>
          <div className="min-h-screen flex flex-col">
            {staffPreview && (
                <p className="bg-[var(--site-accent)] px-4 py-2 text-center text-sm font-medium text-[var(--site-accent-ink)]">
                  {typedLocale === 'ar'
                    ? 'وضع «قريباً» مفعّل — أنت ترى الموقع لأنك مسجّل الدخول. الزوار يرون صفحة الانتظار.'
                    : 'Coming-soon mode is on. You can see the site because you are signed in; visitors get the holding page.'}
                </p>
              )}
            <Navbar
              navigation={headerNav}
              logo={settings?.logo ?? null}
              siteName={settings?.siteName ?? 'CMS'}
              locale={typedLocale}
              commerceOn={Boolean(settings?.eCommerceEnabled)}
            />
            {/* clip, not hidden: `hidden` would make this a scroll container
                and break any position: sticky inside it. This absorbs the few
                pixels a full-bleed block overhangs by, because 100vw counts
                the scrollbar and the visible area does not. */}
            <main className="flex-1 overflow-x-clip">{children}</main>
            <Footer navigation={footerNav} settings={settings} locale={typedLocale} />
          </div>
        </NextIntlClientProvider>

        <TrackingScripts settings={settings} />

        {/*
          The saved theme, before customCss so a hand-written override still
          wins. Values come from themeToCss, which only ever emits known slots
          with hex values — a theme cannot smuggle CSS into the page the way a
          raw stylesheet field could.
        */}
        {themeCss && (
          <style
            nonce={nonce}
            // The nonce exists only on the server: React does not serialise it
            // to the client, so hydration compares nonce="abc…" against "" and
            // reports a mismatch on every page load. Suppressed rather than
            // dropped — without the nonce the CSP blocks the style outright.
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        )}

        {settings?.customCss && (
          // Same nonce/hydration story as the theme block above. This one has
          // always had the problem; it simply never fired, because no install
          // in this repo had customCss set.
          <style
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: settings.customCss }}
          />
        )}
      </body>
    </html>
  );
}
