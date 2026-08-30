// components/site/account-nav.tsx
import Link from 'next/link';

const COPY = {
  ar: { orders: 'طلباتي', addresses: 'عناويني', wishlist: 'المفضّلة', profile: 'بياناتي' },
  en: { orders: 'Orders', addresses: 'Addresses', wishlist: 'Saved', profile: 'Details' },
} as const;

/** The four things a customer account holds. */
export function AccountNav({
  locale,
  current,
  wishlistCount,
}: {
  locale: 'ar' | 'en';
  current: 'orders' | 'addresses' | 'wishlist' | 'profile';
  wishlistCount?: number;
}) {
  const c = COPY[locale];
  const items = [
    { key: 'orders' as const, href: `/${locale}/account`, label: c.orders },
    { key: 'addresses' as const, href: `/${locale}/account/addresses`, label: c.addresses },
    { key: 'wishlist' as const, href: `/${locale}/account/wishlist`, label: c.wishlist },
    { key: 'profile' as const, href: `/${locale}/account/profile`, label: c.profile },
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b border-site-line" data-test-id="account-nav">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? 'page' : undefined}
          data-test-id={`account-nav-${item.key}`}
          className={[
            '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
            current === item.key
              ? 'border-site-accent font-medium text-site-ink'
              : 'border-transparent text-site-ink-muted hover:text-site-ink',
          ].join(' ')}
        >
          {item.label}
          {item.key === 'wishlist' && wishlistCount ? (
            <span className="ms-1 text-xs tabular-nums text-site-ink-muted">{wishlistCount}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
