// components/site/navbar.tsx
'use client';

import Image from 'next/image';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Search, User, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

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
  /** Whether the shop is switched on; hides the account link when it is not. */
  commerceOn?: boolean;
  /** False when the site has no dark colours saved: nothing to switch to. */
  showThemeToggle?: boolean;
}

export function Navbar({
  navigation,
  logo,
  siteName,
  locale,
  commerceOn = false,
  showThemeToggle = false,
}: NavbarProps) {
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
    <nav className="sticky top-0 z-50 border-b border-site-line bg-site-surface/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 shrink-0"
            data-test-id="navbar-home"
          >
            {logo ? (
              <Image
                src={logo}
                alt={siteName}
                width={160}
                height={32}
                priority
                className="h-8 w-auto"
              />
            ) : (
              <span className="text-xl font-bold text-site-ink">{siteName}</span>
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
                    'text-sm font-medium transition-colors hover:text-site-ink',
                    pathname === href
                      ? 'text-site-ink'
                      : 'text-site-ink-muted'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Tighter on phones: this row now holds six controls, and at 390px
              the old gap-2 pushed the menu button off the edge — a horizontal
              scrollbar on every page. Unchanged from sm upwards. */}
          <div className="flex items-center gap-0.5 sm:gap-2">
            <Link
              href={`/${locale}/search`}
              aria-label={locale === 'ar' ? 'بحث' : 'Search'}
              data-test-id="navbar-search"
              className="rounded-full p-1.5 hover:bg-site-surface-raised sm:p-2"
            >
              <Search size={20} aria-hidden="true" />
            </Link>

            {/* Only when there is a shop: an account here exists to show order
                history, so it is meaningless on a content-only site. */}
            {commerceOn && (
              <Link
                href={`/${locale}/account/wishlist`}
                aria-label={locale === 'ar' ? 'المفضّلة' : 'Wishlist'}
                data-test-id="navbar-wishlist"
                className="rounded-full p-1.5 hover:bg-site-surface-raised sm:p-2"
              >
                <Heart size={20} aria-hidden="true" />
              </Link>
            )}

            {commerceOn && (
              <Link
                href={`/${locale}/account`}
                aria-label={locale === 'ar' ? 'حسابي' : 'My account'}
                data-test-id="navbar-account"
                className="rounded-full p-1.5 hover:bg-site-surface-raised sm:p-2"
              >
                <User size={20} aria-hidden="true" />
              </Link>
            )}

            {showThemeToggle && <ThemeToggle locale={locale} />}

            <Link
              href={swappedPath}
              hrefLang={otherLocale}
              aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
              data-test-id="navbar-locale-switch"
              className="rounded-full bg-site-surface-raised px-2 py-1 text-sm font-medium hover:bg-site-line sm:px-3"
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
        <div id="navbar-mobile" className="border-t border-site-line bg-site-surface md:hidden">
          <div className="px-4 py-3 flex flex-col gap-1">
            {navigation.map((item) => (
              <Link
                key={item.id}
                href={localized(item.url)}
                onClick={() => setMobileOpen(false)}
                className="py-3 text-sm font-medium text-site-ink-muted hover:text-site-ink"
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
