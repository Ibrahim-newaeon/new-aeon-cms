// app/(site)/[locale]/shop/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listShopProducts } from '@/lib/commerce/storefront';
import { commerceEnabled } from '@/lib/commerce/guard';
import { ShopGrid } from '@/components/site/shop-grid';
import { getSettings } from '@/lib/db/queries';
import { locales, type Locale } from '@/lib/env';

export const metadata: Metadata = { title: 'المتجر' };

export default async function ShopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();

  // Disabling commerce must close the storefront, not just hide the menu.
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;
  const [items, settings] = await Promise.all([listShopProducts(typedLocale), getSettings()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">
        {typedLocale === 'ar' ? 'المتجر' : 'Shop'}
      </h1>
      <ShopGrid items={items} locale={typedLocale} currency={settings?.currency ?? 'JOD'} />
    </div>
  );
}
