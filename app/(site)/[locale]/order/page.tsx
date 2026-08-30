// app/(site)/[locale]/order/page.tsx
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { commerceEnabled } from '@/lib/commerce/guard';
import { OrderLookup } from '@/components/site/order-lookup';
import { locales, type Locale } from '@/lib/env';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'تتبّع طلبك' : 'Track your order',
    robots: { index: false, follow: false },
  };
}

/**
 * Order lookup for someone with no account.
 *
 * Hands off to the order page itself, which does the actual access check —
 * there is one place that decides who may see an order, and this is not it.
 */
export default async function OrderLookupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ n?: string; phone?: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();

  const { n, phone } = await searchParams;

  if (n?.trim() && phone?.trim()) {
    const number = encodeURIComponent(n.trim());
    redirect(`/${locale}/order/${number}?phone=${encodeURIComponent(phone.trim())}`);
  }

  return <OrderLookup locale={locale as Locale} notFound />;
}
