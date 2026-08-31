// app/(site)/[locale]/products/[slug]/page.tsx
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getShopProduct } from '@/lib/commerce/storefront';
import { commerceEnabled } from '@/lib/commerce/guard';
import { getSettings } from '@/lib/db/queries';
import { Price } from '@/components/site/price';
import { AddToCart } from '@/components/site/add-to-cart';
import { ProductReviews } from '@/components/site/product-reviews';
import { listApprovedReviews, reviewSummary } from '@/lib/commerce/reviews';
import { MessageCircle } from 'lucide-react';
import { WishlistButton } from '@/components/site/wishlist-button';
import { whatsappLink, productEnquiry } from '@/lib/commerce/whatsapp';
import { getStoreCountry } from '@/lib/commerce/regions';
import { absoluteUrl } from '@/lib/seo/json-ld';
import { currentCustomer } from '@/lib/auth/customer-session';
import { isWishlisted } from '@/lib/account/profile';
import { buildMetadata } from '@/lib/seo/metadata';
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

  const settings = await getSettings();
  return buildMetadata({
    locale: locale as Locale,
    path: `/products/${slug}`,
    title: record.product.metaTitle || record.product.name,
    // Falls through short then long: a product page that shares as a bare URL
    // is a lost sale on WhatsApp, which is how this shop's links travel.
    description:
      record.product.metaDescription || record.product.shortDesc || record.product.description,
    image: record.images[0]?.url ?? settings?.logo,
    siteName: settings?.siteName,
  });
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

  /**
   * Where "Enquire" goes when there is no WhatsApp number.
   *
   * It used to be a hardcoded `/{locale}/contact`, and that route does not
   * exist — no CMS page uses the slug and there is no such route file, so every
   * product page on a shop without a WhatsApp number carried a dead link. It
   * stayed hidden here only because this shop happens to have one set.
   *
   * A mailto/tel from Settings is something every shop already has, and the
   * control renders nothing at all when there is no way to make contact —
   * better than offering a button that goes nowhere.
   */
  const enquiryFallback = settings?.contactEmail
    ? `mailto:${settings.contactEmail}`
    : settings?.contactPhone
      ? `tel:${settings.contactPhone.replace(/[^\d+]/g, '')}`
      : null;

  const enquiryHref = whatsappLink({
    phone: settings?.whatsappNumber,
    country: await getStoreCountry(),
    message: productEnquiry(typedLocale, {
      name: product.name,
      sku: variants.length === 1 ? variants[0]!.sku : null,
      url: absoluteUrl(`/${typedLocale}/products/${product.slug}`),
    }),
  });

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
            <Price amount={product.basePrice} currency={currency} locale={typedLocale}
              className="text-2xl font-semibold text-site-ink" />
            {product.compareAtPrice != null && product.compareAtPrice > product.basePrice && (
              <Price amount={product.compareAtPrice} currency={currency} locale={typedLocale}
                strike className="text-lg text-site-ink-muted" />
            )}
          </p>

          <p className={inStock ? 'text-sm text-site-success' : 'text-sm text-site-danger'}>
            {inStock ? (ar ? 'متوفّر' : 'In stock') : ar ? 'غير متوفّر حالياً' : 'Out of stock'}
          </p>

          {/* C1 rendered these as read-only chips because there was no cart.
              Now they select a variant and add it. */}
          {/* All three in one row: the primary buy action, the way to ask a
              question, and save-for-later. They were split across the page by
              the description and specs.

              Two colours, deliberately. Add to cart carries the site accent
              because it is THE action; WhatsApp carries WhatsApp's own green,
              which both distinguishes it and is the colour people already
              recognise. Two accent-coloured buttons side by side compete, and
              a shopper reads neither as primary. Save stays outlined — it is a
              third-tier action and should not shout. */}
          <AddToCart
            options={options}
            variants={selectable}
            locale={typedLocale}
            actions={
              <>
                {enquiryHref ? (
                  <a
                    href={enquiryHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="site-whatsapp inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium"
                    data-test-id="product-whatsapp"
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    {ar ? 'استفسر عبر واتساب' : 'Ask on WhatsApp'}
                  </a>
                ) : enquiryFallback ? (
                  <a
                    href={enquiryFallback}
                    className="site-btn-outline px-6 py-3 text-sm font-medium"
                    data-test-id="product-enquire"
                  >
                    {ar ? 'استفسر عن المنتج' : 'Enquire about this product'}
                  </a>
                ) : null}

                <WishlistButton
                  productId={product.id}
                  locale={typedLocale}
                  initial={saved}
                  signedIn={Boolean(shopper)}
                />
              </>
            }
          />


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
