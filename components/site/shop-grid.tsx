// components/site/shop-grid.tsx
import Image from 'next/image';
import Link from 'next/link';
import { formatPrice } from '@/lib/money';
import type { ShopCard } from '@/lib/commerce/storefront';

export function ShopGrid({
  items,
  locale,
  currency,
}: {
  items: ShopCard[];
  locale: 'ar' | 'en';
  currency: string;
}) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-site-ink-muted">
        {locale === 'ar' ? 'لا توجد منتجات معروضة حالياً.' : 'No products available yet.'}
      </p>
    );
  }

  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.slug}>
          <Link
            href={`/${locale}/products/${item.slug}`}
            className="flex h-full flex-col overflow-hidden rounded-lg border border-site-line transition-colors hover:bg-site-surface-raised"
          >
            {item.image && (
              // fill needs a positioned ancestor; the wrapper also holds the
              // aspect ratio that used to sit on the <img> itself.
              <div className="relative aspect-square w-full">
                <Image
                  src={item.image.url}
                  alt={item.image.alt ?? ''}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
            )}
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h2 className="font-semibold text-site-ink">{item.name}</h2>
              {item.shortDesc && (
                <p className="line-clamp-2 text-sm text-site-ink-muted">{item.shortDesc}</p>
              )}
              <p className="mt-auto flex items-baseline gap-2">
                <span className="font-semibold text-site-ink" dir="ltr">
                  {formatPrice(item.basePrice, currency, locale)}
                </span>
                {item.compareAtPrice != null && item.compareAtPrice > item.basePrice && (
                  <span className="text-sm text-site-ink-muted line-through" dir="ltr">
                    {formatPrice(item.compareAtPrice, currency, locale)}
                  </span>
                )}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
