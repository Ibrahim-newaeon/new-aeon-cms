// app/(site)/[locale]/products/[slug]/page.tsx
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getShopProduct } from '@/lib/commerce/storefront';
import { commerceEnabled } from '@/lib/commerce/guard';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
import { AddToCart } from '@/components/site/add-to-cart';
import { ProductReviews } from '@/components/site/product-reviews';
import { listApprovedReviews, reviewSummary } from '@/lib/commerce/reviews';
import { WishlistButton } from '@/components/site/wishlist-button';
import { currentCustomer } from '@/lib/auth/customer-session';
import { isWishlisted } from '@/lib/account/profile';
import { locales, type Locale } from '@/lib/env';
import { JsonLd } from '@/components/site/json-ld';
import { productJsonLd, breadcrumbJsonLd } from '@/lib/seo/json-ld';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!locales.includes(locale as Locale)) return {};
  const record = await getShopProduct(slug, locale as Locale);
  if (!record) return {};
  return {
    title: record.product.metaTitle || record.product.name,
    description: record.product.metaDescription || record.product.shortDesc || undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;
  const [record, settings] = await Promise.all([
    getShopProduct(slug, typedLocale),
    getSettings(),
  ]);

  if (!record) notFound();

  const currency = settings?.currency ?? 'JOD';
  const { product, images, specs, options, selectable, variants, inStock } = record;
  const ar = typedLocale === 'ar';

  // Only approved reviews reach the page, and the average is computed from the
  // same set rather than stored — a denormalised mean drifts the first time a
  // moderation path forgets to update it.
  const shopper = await currentCustomer();

  const [reviews, summary, saved] = await Promise.all([
    listApprovedReviews(product.id),
    reviewSummary(product.id),
    // Only asked when there is somebody to ask about.
    shopper ? isWishlisted(shopper.sub, product.id) : Promise.resolve(false),
  ]);

  /**
   * Structured data, built from the same values the page renders below rather
   * than from a second query — Google flags a rich result whose price or
   * availability disagrees with the visible page, and two queries are exactly
   * how that disagreement gets in.
   */
  const productSchema = productJsonLd({
    slug: product.slug,
    name: product.name,
    description: product.metaDescription || product.shortDesc || product.description,
    // Only when the product IS one item. With several variants the page shows a
    // selector, and no single SKU describes what is on offer.
    sku: variants.length === 1 ? variants[0]!.sku : null,
    images: images.map((img) => img.url),
    basePrice: product.basePrice,
    currency,
    locale: typedLocale,
    inStock,
    variants: variants.map((v) => ({ price: v.price, stock: v.stock })),
    rating: summary.count > 0 ? { average: summary.average, count: summary.count } : null,
  });

  const breadcrumbs = breadcrumbJsonLd([
    { name: ar ? 'المتجر' : 'Shop', path: `/${typedLocale}/shop` },
    { name: product.name, path: `/${typedLocale}/products/${product.slug}` },
  ]);

  return (
    <article className="mx-auto max-w-6xl px-4 py-16">
      <JsonLd data={productSchema} />
      <JsonLd data={breadcrumbs} />

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-3">
          {/* The main product shot is the LCP element on this page. */}
          {images[0] ? (
            <Image
              src={images[0].url}
              alt={images[0].alt ?? ''}
              width={800}
              height={800}
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="h-auto w-full rounded-lg"
            />
          ) : (
            <div className="aspect-square w-full rounded-lg bg-site-surface-raised" />
          )}

          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.slice(1).map((img) => (
                <div key={img.id} className="relative aspect-square w-full">
                  <Image
                    src={img.url}
                    alt={img.alt ?? ''}
                    fill
                    sizes="(max-width: 1024px) 25vw, 12vw"
                    className="rounded object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <h1 className="text-3xl font-bold text-site-ink">{product.name}</h1>

          <p className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold text-site-ink" dir="ltr">
              {formatPrice(product.basePrice, currency, typedLocale)}
            </span>
            {product.compareAtPrice != null && product.compareAtPrice > product.basePrice && (
              <span className="text-lg text-site-ink-muted line-through" dir="ltr">
                {formatPrice(product.compareAtPrice, currency, typedLocale)}
              </span>
            )}
          </p>

          <p className={inStock ? 'text-sm text-site-success' : 'text-sm text-site-danger'}>
            {inStock ? (ar ? 'متوفّر' : 'In stock') : ar ? 'غير متوفّر حالياً' : 'Out of stock'}
          </p>

          {/* C1 rendered these as read-only chips because there was no cart.
              Now they select a variant and add it. */}
          <AddToCart options={options} variants={selectable} locale={typedLocale} />


          {product.description && (
            <p className="whitespace-pre-line text-site-ink-muted">{product.description}</p>
          )}

          {specs.length > 0 && (
            <dl className="divide-y divide-site-line border-t border-site-line text-sm">
              {specs.map((spec) => (
                <div key={spec.id} className="flex justify-between gap-4 py-2">
                  <dt className="text-site-ink-muted">{spec.key}</dt>
                  <dd className="text-site-ink">{spec.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* Both are inline-flex, so in a space-y stack they sat on one line
              and overlapped. A flex row with a gap is what was meant. */}
          <div className="flex flex-wrap items-center gap-3">
            <WishlistButton
              productId={product.id}
              locale={typedLocale}
              initial={saved}
              signedIn={Boolean(shopper)}
            />

            <Link
              href={`/${typedLocale}/contact`}
              className="inline-flex rounded-lg bg-site-accent px-6 py-3 text-sm font-medium text-site-accent-ink hover:bg-site-accent-hover"
            >
              {ar ? 'استفسر عن المنتج' : 'Enquire about this product'}
            </Link>
          </div>
        </div>
      </div>

      <ProductReviews
        productId={product.id}
        locale={typedLocale}
        summary={summary}
        reviews={reviews.map((r) => ({
          id: r.id,
          customerName: r.customerName,
          rating: r.rating,
          body: r.body,
          createdAt: r.createdAt ? r.createdAt.toISOString() : null,
        }))}
      />
    </article>
  );
}
