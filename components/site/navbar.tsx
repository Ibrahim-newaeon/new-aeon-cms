// components/site/navbar.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shape returned by getNavigation(). Was `any[]`. */
export interface NavItem {
  id: string;
  label: string;
  url: string;
  openInNew: boolean | null;
}

interface NavbarProps {
  navigation: NavItem[];
  logo?: string | null;
  /** From settings — never a hardcoded brand string. */
  siteName: string;
  locale: 'ar' | 'en';
}

export function Navbar({ navigation, logo, siteName, locale }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const otherLocale = locale === 'ar' ? 'en' : 'ar';

  // Replace only the leading locale segment. A blind `.replace('/ar', …)`
  // would corrupt a path like /ar/library/archive.
  const swappedPath = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), `/${otherLocale}`);

  // Nav URLs stored in the DB are locale-agnostic ("/about"); prefix them so
  // links do not escape the current locale.
  const localized = (url: string) =>
    /^https?:\/\//i.test(url) ? url : `/${locale}${url.startsWith('/') ? url : `/${url}`}`;

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 shrink-0"
            data-test-id="navbar-home"
          >
            {logo ? (
              <img src={logo} alt={siteName} className="h-8 w-auto" />
            ) : (
              <span className="text-xl font-bold text-gray-900">{siteName}</span>
            )}
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navigation.map((item) => {
              const href = localized(item.url);
              return (
                <Link
                  key={item.id}
                  href={href}
                  target={item.openInNew ? '_blank' : undefined}
                  rel={item.openInNew ? 'noopener noreferrer' : undefined}
                  aria-current={pathname === href ? 'page' : undefined}
                  data-test-id={`navbar-link-${item.id}`}
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-gray-900',
                    pathname === href ? 'text-gray-900' : 'text-gray-600'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/search`}
              aria-label={locale === 'ar' ? 'بحث' : 'Search'}
              data-test-id="navbar-search"
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <Search size={20} aria-hidden="true" />
            </Link>

            <Link
              href={swappedPath}
              hrefLang={otherLocale}
              aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
              data-test-id="navbar-locale-switch"
              className="text-sm font-medium px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200"
            >
              {locale === 'ar' ? 'EN' : 'عربي'}
            </Link>

            <button
              type="button"
              className="md:hidden p-2"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="navbar-mobile"
              aria-label={locale === 'ar' ? 'القائمة' : 'Menu'}
              data-test-id="navbar-menu-toggle"
            >
              {mobileOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div id="navbar-mobile" className="md:hidden border-t bg-white">
          <div className="px-4 py-3 flex flex-col gap-1">
            {navigation.map((item) => (
              <Link
                key={item.id}
                href={localized(item.url)}
                onClick={() => setMobileOpen(false)}
                className="py-3 text-sm font-medium text-gray-700 hover:text-gray-900"
                data-test-id={`navbar-mobile-link-${item.id}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
