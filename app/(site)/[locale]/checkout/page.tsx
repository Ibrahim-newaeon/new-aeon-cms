// app/(site)/[locale]/checkout/page.tsx
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { mintCheckoutToken } from '@/lib/commerce/checkout-token';
import { readCartCookie, priceCart } from '@/lib/commerce/cart';
import { commerceEnabled } from '@/lib/commerce/guard';
import { getSettings } from '@/lib/db/queries';
import { CheckoutForm } from '@/components/site/checkout-form';
import { getShippingRegions } from '@/lib/commerce/regions';
import { checkoutPrefill } from '@/lib/account/prefill';
import { locales, type Locale } from '@/lib/env';

/**
 * Locale-aware because static `metadata` is not: Next evaluates it once,
 * without route params, so a hardcoded title renders on BOTH locales. That is
 * why /en/checkout served an Arabic <title>.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'إتمام الطلب' : 'Checkout',
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;
  const [cookie, settings] = await Promise.all([readCartCookie(), getSettings()]);
  const cart = await priceCart(cookie, typedLocale);

  // Nothing to check out, or lines that cannot be bought: send them back rather
  // than showing a form that is guaranteed to fail.
  if (cart.itemCount === 0 || cart.hasUnavailable) {
    redirect(`/${typedLocale}/cart`);
  }

  // Signed and rendered into the form. A cookie cannot be set during a Server
  // Component render, and would collide across tabs anyway.
  const token = await mintCheckoutToken();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-bold text-site-ink">
        {typedLocale === 'ar' ? 'إتمام الطلب' : 'Checkout'}
      </h1>
      <CheckoutForm
        regions={await getShippingRegions()}
        prefill={await checkoutPrefill()}
        locale={typedLocale}
        currency={settings?.currency ?? 'JOD'}
        subtotal={cart.subtotal}
        token={token}
      />
    </div>
  );
}
