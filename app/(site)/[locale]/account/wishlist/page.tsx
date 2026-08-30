// app/(site)/[locale]/account/wishlist/page.tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentCustomer } from '@/lib/auth/customer-session';
import { listWishlist } from '@/lib/account/profile';
import { AccountNav } from '@/components/site/account-nav';
import { WishlistRemove } from '@/components/site/wishlist-button';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
import type { Locale } from '@/lib/env';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function WishlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = locale as Locale;
  const session = await currentCustomer();
  if (!session) redirect(`/${locale}/account`);

  const [items, settings] = await Promise.all([
    listWishlist(session.sub, typedLocale),
    getSettings(),
  ]);
  const currency = settings?.currency ?? 'JOD';
  const ar = typedLocale === 'ar';

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-3xl font-bold text-site-ink">{ar ? 'المفضّلة' : 'Saved'}</h1>
      <div className="mt-8">
        <AccountNav locale={typedLocale} current="wishlist" wishlistCount={items.length} />
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-site-ink-muted" data-test-id="wishlist-empty">
          {ar ? 'لم تحفظ أي منتج بعد.' : 'Nothing saved yet.'}
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2" data-test-id="wishlist-items">
          {items.map((item) => (
            <li
              key={item.productId}
              className="flex items-center gap-3 rounded-lg border border-site-line p-3"
            >
              <Link href={`/${typedLocale}/products/${item.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                {item.image ? (
                  <Image src={item.image} alt="" width={64} height={64}
                    className="h-16 w-16 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded bg-site-surface-raised" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium text-site-ink">{item.name}</span>
                  <span className="mt-1 block text-sm text-site-ink-muted" dir="ltr">
                    {formatPrice(item.basePrice, currency, typedLocale)}
                  </span>
                  {/* A saved product can be withdrawn from sale; saying so beats
                      a link that quietly 404s. */}
                  {!item.isActive && (
                    <span className="mt-1 block text-xs text-site-danger">
                      {ar ? 'لم يعد متوفراً' : 'No longer available'}
                    </span>
                  )}
                </span>
              </Link>
              <WishlistRemove productId={item.productId} locale={typedLocale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
