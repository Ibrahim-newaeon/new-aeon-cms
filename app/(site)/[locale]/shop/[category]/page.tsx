// app/(site)/[locale]/shop/[category]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getShopCategory } from '@/lib/commerce/storefront';
import { commerceEnabled } from '@/lib/commerce/guard';
import { ShopPageBody } from '../shop-page';
import type { SearchParams } from '@/lib/commerce/shop-query';
import { buildMetadata } from '@/lib/seo/metadata';
import { getDefaultLocale } from '@/lib/default-locale';
import { getSettings } from '@/lib/db/queries';
import { locales, type Locale } from '@/lib/env';

interface Props {
  params: Promise<{ locale: string; category: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, category } = await params;
  if (!locales.includes(locale as Locale)) return {};
  const row = await getShopCategory(category, locale as Locale);
  if (!row) return {};

  const settings = await getSettings();
  return buildMetadata({
    defaultLocale: await getDefaultLocale(),
    locale: locale as Locale,
    path: `/shop/${category}`,
    title: row.name ?? category,
    description: settings?.siteDescription,
    image: settings?.logo,
    siteName: settings?.siteName,
  });
}

/**
 * The same shop, with the category fixed by the URL.
 *
 * This stays a real page rather than becoming /shop?category=: it was already
 * indexable, and letting the filter bar write the category as a query
 * parameter too would put the same products at two addresses.
 */
export default async function ShopCategoryPage({ params, searchParams }: Props) {
  const { locale, category } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;
  const row = await getShopCategory(category, typedLocale);
  if (!row) notFound();

  return (
    <ShopPageBody
      locale={typedLocale}
      searchParams={await searchParams}
      categoryFromPath={row.slug}
      title={row.name ?? row.slug}
    />
  );
}
