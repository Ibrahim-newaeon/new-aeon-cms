// app/(site)/[locale]/order/[orderNumber]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { orderItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { commerceEnabled } from '@/lib/commerce/guard';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
import { accessOrder } from '@/lib/commerce/order-access';
import { OrderLookup } from '@/components/site/order-lookup';
import { locales, type Locale } from '@/lib/env';

/**
 * Locale-aware because static `metadata` is not: Next evaluates it once,
 * without route params, so a hardcoded title renders on BOTH locales. That is
 * why /en/order/… served an Arabic <title>.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; orderNumber: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'تفاصيل الطلب' : 'Order details',
    // Reachable by order number alone, so it must never be indexed.
    robots: { index: false, follow: false },
  };
}

const STATUS_LABEL: Record<string, { ar: string; en: string }> = {
  pending: { ar: 'قيد المراجعة', en: 'Pending' },
  confirmed: { ar: 'مؤكَّد', en: 'Confirmed' },
  processing: { ar: 'قيد التجهيز', en: 'Processing' },
  shipped: { ar: 'تم الشحن', en: 'Shipped' },
  delivered: { ar: 'تم التسليم', en: 'Delivered' },
  cancelled: { ar: 'ملغى', en: 'Cancelled' },
  refunded: { ar: 'مُسترد', en: 'Refunded' },
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; orderNumber: string }>;
  searchParams: Promise<{ phone?: string }>;
}) {
  const { locale, orderNumber } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;

  /**
   * Order numbers come from a sequence, so this page used to hand anyone
   * counting upward every customer's name, phone and delivery address. Access
   * now needs one of: this browser placed it, you are signed in and it is
   * yours, or you supply the phone it was placed with.
   */
  const { phone } = await searchParams;
  const access = await accessOrder(orderNumber, phone);

  if (!access.allowed) {
    // The same prompt whether or not the order exists, so this cannot be used
    // to discover which numbers are real.
    return <OrderLookup locale={typedLocale} orderNumber={orderNumber} notFound={!phone} />;
  }

  const order = access.order;

  const [items, settings] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    getSettings(),
  ]);

  const currency = order.currency ?? settings?.currency ?? 'JOD';
  const ar = typedLocale === 'ar';
  // noUncheckedIndexedAccess makes the fallback itself possibly-undefined.
  const status = STATUS_LABEL[order.status] ?? { ar: 'قيد المراجعة', en: 'Pending' };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-sm text-site-success">
        {ar ? 'تم استلام طلبك.' : 'Your order has been received.'}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-site-ink" dir="ltr">{order.orderNumber}</h1>
      <p className="mt-1 text-sm text-site-ink-muted">
        {ar ? 'الحالة: ' : 'Status: '}{ar ? status.ar : status.en}
      </p>

      {/*
        No phone, no address. This page is reachable by order number alone, so it
        shows what was bought and what it cost — never anything personal.
      */}
      <ul className="mt-8 divide-y divide-site-line border-y border-site-line">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-site-ink">{item.nameSnapshot}</p>
              <p className="text-xs text-site-ink-muted" dir="ltr">
                {item.skuSnapshot} × {item.qty}
              </p>
            </div>
            <p className="shrink-0 text-sm text-site-ink" dir="ltr">
              {formatPrice(item.priceSnapshot * item.qty, currency, typedLocale)}
            </p>
          </li>
        ))}
      </ul>

      <dl className="mt-6 space-y-2 text-sm">
        <Row label={ar ? 'المجموع الفرعي' : 'Subtotal'} value={formatPrice(order.subtotal, currency, typedLocale)} />
        {(order.discount ?? 0) > 0 && (
          <Row
            label={ar ? 'الخصم' : 'Discount'}
            value={`- ${formatPrice(order.discount ?? 0, currency, typedLocale)}`}
          />
        )}
        <Row label={ar ? 'التوصيل' : 'Delivery'} value={formatPrice(order.shipping, currency, typedLocale)} />
        <div className="flex justify-between border-t border-site-line pt-2 text-base font-semibold">
          <dt>{ar ? 'الإجمالي' : 'Total'}</dt>
          <dd dir="ltr">{formatPrice(order.total, currency, typedLocale)}</dd>
        </div>
      </dl>

      <p className="mt-6 text-sm text-site-ink-muted">
        {ar ? 'الدفع نقداً عند الاستلام.' : 'Payment is cash on delivery.'}
      </p>

      <Link href={`/${typedLocale}/shop`} className="mt-8 inline-block text-site-accent hover:underline">
        {ar ? 'متابعة التسوّق' : 'Continue shopping'}
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-site-ink-muted">{label}</dt>
      <dd className="text-site-ink" dir="ltr">{value}</dd>
    </div>
  );
}
