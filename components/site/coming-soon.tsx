// components/site/coming-soon.tsx
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
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-6 text-center">
      <div className="max-w-lg space-y-5">
        {settings?.logo ? (
          <img src={settings.logo} alt={siteName} className="mx-auto h-12 w-auto object-contain" />
        ) : (
          <h1 className="text-3xl font-bold text-white">{siteName}</h1>
        )}

        <p className="text-lg text-gray-300">{message}</p>

        {settings?.contactEmail && (
          <p className="text-sm text-gray-500">
            <a href={`mailto:${settings.contactEmail}`} className="hover:text-gray-300" dir="ltr">
              {settings.contactEmail}
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
