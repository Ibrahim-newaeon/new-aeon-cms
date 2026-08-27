// app/(site)/[locale]/cart/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readCartCookie, priceCart } from '@/lib/commerce/cart';
import { commerceEnabled } from '@/lib/commerce/guard';
import { getSettings } from '@/lib/db/queries';
import { CartViewClient } from '@/components/site/cart-view';
import { locales, type Locale } from '@/lib/env';

export const metadata: Metadata = {
  title: 'السلة',
  robots: { index: false, follow: false },
};

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;
  const [cookie, settings] = await Promise.all([readCartCookie(), getSettings()]);
  const cart = await priceCart(cookie, typedLocale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">
        {typedLocale === 'ar' ? 'سلة المشتريات' : 'Your cart'}
      </h1>
      <CartViewClient cart={cart} locale={typedLocale} currency={settings?.currency ?? 'JOD'} />
    </div>
  );
}
