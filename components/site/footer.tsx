import Link from 'next/link';

import type { NavItem } from './navbar';
import type { SiteSettings } from '@/lib/db/queries';

/**
 * The `locale` prop was already threaded in and never read, so these three
 * strings rendered Arabic on the English site — on every page, since the
 * footer is in the site layout.
 */
const COPY = {
  ar: {
    quickLinks: 'روابط سريعة',
    contact: 'تواصل معنا',
    rights: 'جميع الحقوق محفوظة.',
  },
  en: {
    quickLinks: 'Quick links',
    contact: 'Contact us',
    rights: 'All rights reserved.',
  },
} as const;

interface FooterProps {
  navigation: NavItem[];
  settings: SiteSettings | null;
  locale: 'ar' | 'en';
}

export function Footer({ navigation, settings, locale }: FooterProps) {
  const currentYear = new Date().getFullYear();
  const copy = COPY[locale];

  return (
    <footer className="bg-site-surface-inverted text-site-ink-inverted/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <h3 className="mb-4 text-xl font-bold text-site-ink-inverted">
              {settings?.siteName ?? ''}
            </h3>
            <p className="max-w-sm text-sm text-site-ink-inverted/60">
              {settings?.siteDescription || 'Content Management System'}
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-site-ink-inverted">{copy.quickLinks}</h4>
            <ul className="space-y-2">
              {navigation.map((item) => (
                <li key={item.id}>
                  <Link href={item.url} className="text-sm transition-colors hover:text-site-ink-inverted">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-site-ink-inverted">{copy.contact}</h4>
            <ul className="space-y-2 text-sm">
              {/* dir="ltr" because a phone number is a left-to-right run, and on
                  an Arabic page the bidi algorithm otherwise places the leading
                  "+" per the paragraph direction — "+962 7 9000 0000" rendered
                  as "0000 9000 7 962+". The email is Latin letters, which are
                  strongly LTR and need no help, but it is marked for the same
                  reason the next person will look here. */}
              {settings?.contactEmail && (
                <li><a dir="ltr" href={`mailto:${settings.contactEmail}`} className="inline-block hover:text-site-ink-inverted">{settings.contactEmail}</a></li>
              )}
              {settings?.contactPhone && (
                <li><a dir="ltr" href={`tel:${settings.contactPhone}`} className="inline-block hover:text-site-ink-inverted">{settings.contactPhone}</a></li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-site-ink-inverted/15 pt-8 text-center text-sm text-site-ink-inverted/50">
          © {currentYear} {settings?.siteName ?? ''}. {copy.rights}
        </div>
      </div>
    </footer>
  );
}
