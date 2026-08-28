// components/site/blocks/product-grid.tsx
import Image from 'next/image';
import { db } from '@/lib/db';
import { products, productI18n, productImages } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { cn } from '@/lib/utils';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/utils';
import type { ContentBlock } from '@/lib/blocks/types';

type ProductGrid = Extract<ContentBlock, { type: 'product-grid' }>;

/**
 * Commerce is a module that can be switched off, and the mega-prompt is
 * explicit: when disabled, "no commerce tables accessed". So this checks the
 * setting BEFORE issuing any query, rather than rendering an empty grid.
 */
export async function ProductGridBlock({
  block,
  locale,
}: {
  block: ProductGrid;
  locale: 'ar' | 'en';
}) {
  const settings = await getSettings();
  if (!settings?.eCommerceEnabled) return null;

  const ids = block.productIds.filter(Boolean).slice(0, 24);
  if (ids.length === 0) return null;

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      name: productI18n.name,
      shortDesc: productI18n.shortDesc,
    })
    .from(products)
    .leftJoin(
      productI18n,
      and(eq(products.id, productI18n.productId), eq(productI18n.locale, locale))
    )
    .where(and(inArray(products.id, ids), eq(products.isActive, true)));

  if (rows.length === 0) return null;

  const images = await db
    .select({ productId: productImages.productId, url: productImages.url, alt: productImages.alt })
    .from(productImages)
    .where(inArray(productImages.productId, rows.map((r) => r.id)));

  const firstImage = new Map<string, { url: string; alt: string | null }>();
  for (const img of images) {
    if (!firstImage.has(img.productId)) firstImage.set(img.productId, img);
  }

  const currency = settings.currency ?? 'JOD';

  return (
    <div
      className={cn(
        block.layout === 'list' ? 'space-y-4' : 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3'
      )}
      data-test-id="product-grid"
    >
      {rows.map((product) => {
        const image = firstImage.get(product.id);
        return (
          <a
            key={product.id}
            href={`/${locale}/products/${product.slug}`}
            className="block overflow-hidden rounded-lg border border-gray-200 transition-colors hover:bg-gray-50"
          >
            {image && (
              <div className="relative aspect-square w-full">
                <Image
                  src={image.url}
                  alt={image.alt ?? ''}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover"
                />
              </div>
            )}
            <div className="p-4">
              <h3 className="font-medium text-gray-900">{product.name ?? product.slug}</h3>
              {product.shortDesc && (
                <p className="mt-1 line-clamp-2 text-sm text-gray-600">{product.shortDesc}</p>
              )}
              <p className="mt-2 flex items-baseline gap-2">
                <span className="font-semibold text-gray-900" dir="ltr">
                  {formatPrice(product.basePrice, currency, locale)}
                </span>
                {product.compareAtPrice != null && product.compareAtPrice > product.basePrice && (
                  <span className="text-sm text-gray-400 line-through" dir="ltr">
                    {formatPrice(product.compareAtPrice, currency, locale)}
                  </span>
                )}
              </p>
            </div>
          </a>
        );
      })}
    </div>
  );
}
