// app/(site)/[locale]/products/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getShopProduct } from '@/lib/commerce/storefront';
import { commerceEnabled } from '@/lib/commerce/guard';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
import { AddToCart } from '@/components/site/add-to-cart';
import { locales, type Locale } from '@/lib/env';

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
  const { product, images, specs, options, selectable, inStock } = record;
  const ar = typedLocale === 'ar';

  return (
    <article className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-3">
          {images[0] ? (
            <img
              src={images[0].url}
              alt={images[0].alt ?? ''}
              className="w-full rounded-lg object-cover"
            />
          ) : (
            <div className="aspect-square w-full rounded-lg bg-gray-100" />
          )}

          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.slice(1).map((img) => (
                <img
                  key={img.id}
                  src={img.url}
                  alt={img.alt ?? ''}
                  loading="lazy"
                  className="aspect-square w-full rounded object-cover"
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>

          <p className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold text-gray-900" dir="ltr">
              {formatPrice(product.basePrice, currency, typedLocale)}
            </span>
            {product.compareAtPrice != null && product.compareAtPrice > product.basePrice && (
              <span className="text-lg text-gray-400 line-through" dir="ltr">
                {formatPrice(product.compareAtPrice, currency, typedLocale)}
              </span>
            )}
          </p>

          <p className={inStock ? 'text-sm text-green-700' : 'text-sm text-red-600'}>
            {inStock ? (ar ? 'متوفّر' : 'In stock') : ar ? 'غير متوفّر حالياً' : 'Out of stock'}
          </p>

          {/* C1 rendered these as read-only chips because there was no cart.
              Now they select a variant and add it. */}
          <AddToCart options={options} variants={selectable} locale={typedLocale} />

          {product.description && (
            <p className="whitespace-pre-line text-gray-700">{product.description}</p>
          )}

          {specs.length > 0 && (
            <dl className="divide-y divide-gray-200 border-t border-gray-200 text-sm">
              {specs.map((spec) => (
                <div key={spec.id} className="flex justify-between gap-4 py-2">
                  <dt className="text-gray-500">{spec.key}</dt>
                  <dd className="text-gray-900">{spec.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <Link
            href={`/${typedLocale}/contact`}
            className="inline-flex rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {ar ? 'استفسر عن المنتج' : 'Enquire about this product'}
          </Link>
        </div>
      </div>
    </article>
  );
}
