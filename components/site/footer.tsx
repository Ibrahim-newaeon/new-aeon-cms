import Link from 'next/link';

import type { NavItem } from './navbar';
import type { SiteSettings } from '@/lib/db/queries';

interface FooterProps {
  navigation: NavItem[];
  settings: SiteSettings | null;
  locale: 'ar' | 'en';
}

export function Footer({ navigation, settings, locale }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <h3 className="text-xl font-bold text-white mb-4">
              {settings?.siteName ?? ''}
            </h3>
            <p className="text-sm text-gray-400 max-w-sm">
              {settings?.siteDescription || 'Content Management System'}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">روابط سريعة</h4>
            <ul className="space-y-2">
              {navigation.map((item) => (
                <li key={item.id}>
                  <Link href={item.url} className="text-sm hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">تواصل معنا</h4>
            <ul className="space-y-2 text-sm">
              {settings?.contactEmail && (
                <li><a href={`mailto:${settings.contactEmail}`} className="hover:text-white">{settings.contactEmail}</a></li>
              )}
              {settings?.contactPhone && (
                <li><a href={`tel:${settings.contactPhone}`} className="hover:text-white">{settings.contactPhone}</a></li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
          © {currentYear} {settings?.siteName ?? ''}. جميع الحقوق محفوظة.
        </div>
      </div>
    </footer>
  );
}
