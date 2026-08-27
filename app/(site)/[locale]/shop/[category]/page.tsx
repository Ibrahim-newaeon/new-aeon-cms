// app/(site)/[locale]/shop/[category]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listShopProducts, getShopCategory } from '@/lib/commerce/storefront';
import { commerceEnabled } from '@/lib/commerce/guard';
import { ShopGrid } from '@/components/site/shop-grid';
import { getSettings } from '@/lib/db/queries';
import { locales, type Locale } from '@/lib/env';

interface Props {
  params: Promise<{ locale: string; category: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, category } = await params;
  if (!locales.includes(locale as Locale)) return {};
  const row = await getShopCategory(category, locale as Locale);
  return { title: row?.name ?? category };
}

export default async function ShopCategoryPage({ params }: Props) {
  const { locale, category } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;
  const row = await getShopCategory(category, typedLocale);
  if (!row) notFound();

  const [items, settings] = await Promise.all([
    listShopProducts(typedLocale, row.id),
    getSettings(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">{row.name ?? row.slug}</h1>
      <ShopGrid items={items} locale={typedLocale} currency={settings?.currency ?? 'JOD'} />
    </div>
  );
}
