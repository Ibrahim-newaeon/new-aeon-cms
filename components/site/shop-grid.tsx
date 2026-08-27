// components/site/shop-grid.tsx
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
      <p className="py-12 text-center text-sm text-gray-500">
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
            className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 transition-colors hover:bg-gray-50"
          >
            {item.image && (
              <img
                src={item.image.url}
                alt={item.image.alt ?? ''}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
            )}
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h2 className="font-semibold text-gray-900">{item.name}</h2>
              {item.shortDesc && (
                <p className="line-clamp-2 text-sm text-gray-600">{item.shortDesc}</p>
              )}
              <p className="mt-auto flex items-baseline gap-2">
                <span className="font-semibold text-gray-900" dir="ltr">
                  {formatPrice(item.basePrice, currency, locale)}
                </span>
                {item.compareAtPrice != null && item.compareAtPrice > item.basePrice && (
                  <span className="text-sm text-gray-400 line-through" dir="ltr">
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
