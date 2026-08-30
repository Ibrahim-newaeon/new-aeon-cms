// components/site/coming-soon.tsx
import Image from 'next/image';
import type { SiteSettings } from '@/lib/db/queries';

/**
 * Holding page shown while comingSoonMode is on.
 *
 * Rendered INSTEAD of the site, not on top of it — an overlay would still ship
 * the real page in the HTML, so anyone reading source (or with CSS disabled)
 * would see unreleased content.
 */
export function ComingSoon({
  settings,
  locale,
}: {
  settings: SiteSettings | null;
  locale: 'ar' | 'en';
}) {
  const siteName = settings?.siteName ?? '';
  const message =
    settings?.comingSoonMessage ||
    (locale === 'ar' ? 'الموقع قيد التجهيز. نعود قريباً.' : 'We are getting things ready. Back soon.');

  return (
    <main className="flex min-h-screen items-center justify-center bg-site-surface-inverted px-6 text-center">
      <div className="max-w-lg space-y-5">
        {settings?.logo ? (
          <Image
            src={settings.logo}
            alt={siteName}
            width={240}
            height={48}
            priority
            className="mx-auto h-12 w-auto object-contain"
          />
        ) : (
          <h1 className="text-3xl font-bold text-site-ink-inverted">{siteName}</h1>
        )}

        <p className="text-lg text-site-ink-inverted/70">{message}</p>

        {settings?.contactEmail && (
          <p className="text-sm text-site-ink-muted">
            <a href={`mailto:${settings.contactEmail}`} className="hover:text-site-ink-inverted/70" dir="ltr">
              {settings.contactEmail}
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
