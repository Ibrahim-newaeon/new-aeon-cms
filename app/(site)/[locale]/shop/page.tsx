// app/(site)/[locale]/shop/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { commerceEnabled } from '@/lib/commerce/guard';
import { ShopPageBody } from './shop-page';
import type { SearchParams } from '@/lib/commerce/shop-query';
import { buildMetadata } from '@/lib/seo/metadata';
import { getDefaultLocale } from '@/lib/default-locale';
import { getSettings } from '@/lib/db/queries';
import { locales, type Locale } from '@/lib/env';

/**
 * Locale-aware because static `metadata` is not: Next evaluates it once,
 * without route params, so a hardcoded title renders on BOTH locales. That is
 * why /en/shop served an Arabic <title>.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const settings = await getSettings();
  return buildMetadata({
    defaultLocale: await getDefaultLocale(),
    locale: locale as Locale,
    path: '/shop',
    title: locale === 'ar' ? 'المتجر' : 'Shop',
    description: settings?.siteDescription,
    image: settings?.logo,
    siteName: settings?.siteName,
  });
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();

  // Disabling commerce must close the storefront, not just hide the menu.
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;
  return (
    <ShopPageBody
      locale={typedLocale}
      searchParams={await searchParams}
      title={typedLocale === 'ar' ? 'المتجر' : 'Shop'}
    />
  );
}
