// app/(site)/[locale]/order/[orderNumber]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { orders, orderItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { commerceEnabled } from '@/lib/commerce/guard';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
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
}: {
  params: Promise<{ locale: string; orderNumber: string }>;
}) {
  const { locale, orderNumber } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;
  const rows = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  const order = rows[0];
  if (!order) notFound();

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
      <p className="text-sm text-green-700">
        {ar ? 'تم استلام طلبك.' : 'Your order has been received.'}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900" dir="ltr">{order.orderNumber}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {ar ? 'الحالة: ' : 'Status: '}{ar ? status.ar : status.en}
      </p>

      {/*
        No phone, no address. This page is reachable by order number alone, so it
        shows what was bought and what it cost — never anything personal.
      */}
      <ul className="mt-8 divide-y divide-gray-200 border-y border-gray-200">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{item.nameSnapshot}</p>
              <p className="text-xs text-gray-500" dir="ltr">
                {item.skuSnapshot} × {item.qty}
              </p>
            </div>
            <p className="shrink-0 text-sm text-gray-900" dir="ltr">
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
        <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold">
          <dt>{ar ? 'الإجمالي' : 'Total'}</dt>
          <dd dir="ltr">{formatPrice(order.total, currency, typedLocale)}</dd>
        </div>
      </dl>

      <p className="mt-6 text-sm text-gray-600">
        {ar ? 'الدفع نقداً عند الاستلام.' : 'Payment is cash on delivery.'}
      </p>

      <Link href={`/${typedLocale}/shop`} className="mt-8 inline-block text-indigo-600 hover:underline">
        {ar ? 'متابعة التسوّق' : 'Continue shopping'}
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-gray-900" dir="ltr">{value}</dd>
    </div>
  );
}
