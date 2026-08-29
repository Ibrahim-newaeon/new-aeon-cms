// components/site/cart-view.tsx
'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/money';
import type { CartView as CartData } from '@/lib/commerce/cart';

const COPY = {
  ar: {
    title: 'سلة المشتريات',
    empty: 'سلتك فارغة.',
    browse: 'تصفّح المتجر',
    subtotal: 'المجموع الفرعي',
    bundleSaving: 'توفير الحزم',
    shippingNote: 'تُحتسب أجرة التوصيل في الخطوة التالية.',
    checkout: 'إتمام الطلب',
    remove: 'إزالة',
    qty: 'الكمية',
    unavailable: {
      missing: 'لم يعد هذا المنتج متاحاً',
      inactive: 'لم يعد هذا المنتج معروضاً',
      out_of_stock: 'نفدت الكمية',
      insufficient_stock: 'الكمية المتوفّرة أقل من المطلوبة',
    },
    fixFirst: 'أزل العناصر غير المتوفّرة للمتابعة.',
  },
  en: {
    title: 'Your cart',
    empty: 'Your cart is empty.',
    browse: 'Browse the shop',
    subtotal: 'Subtotal',
    bundleSaving: 'Bundle saving',
    shippingNote: 'Delivery is calculated at the next step.',
    checkout: 'Checkout',
    remove: 'Remove',
    qty: 'Quantity',
    unavailable: {
      missing: 'This product is no longer available',
      inactive: 'This product is no longer listed',
      out_of_stock: 'Out of stock',
      insufficient_stock: 'Fewer in stock than requested',
    },
    fixFirst: 'Remove unavailable items to continue.',
  },
} as const;

export function CartViewClient({
  cart,
  locale,
  currency,
}: {
  cart: CartData;
  locale: 'ar' | 'en';
  currency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const copy = COPY[locale];

  const mutate = async (variantId: string, qty: number) => {
    setBusyId(variantId);
    await fetch('/api/commerce/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'set', variantId, qty }),
    });
    setBusyId(null);
    startTransition(() => router.refresh());
  };

  if (cart.lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500">{copy.empty}</p>
        <Link href={`/${locale}/shop`} className="mt-4 inline-block text-indigo-600 hover:underline">
          {copy.browse}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <ul className="divide-y divide-gray-200 lg:col-span-2">
        {cart.lines.map((line) => (
          <li key={line.variantId} className="flex gap-4 py-4" data-test-id={`cart-line-${line.variantId}`}>
            {line.image ? (
              <Image
                src={line.image}
                alt=""
                width={80}
                height={80}
                className="h-20 w-20 rounded object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded bg-gray-100" />
            )}

            <div className="min-w-0 flex-1">
              <Link href={`/${locale}/products/${line.productSlug}`} className="font-medium text-gray-900 hover:underline">
                {line.name}
              </Link>
              {line.optionSummary && <p className="text-sm text-gray-500">{line.optionSummary}</p>}

              {/* Unavailable lines stay visible with a reason — silently dropping
                  them leaves the buyer wondering what happened. */}
              {!line.available ? (
                <p className="mt-1 text-sm text-red-600">{copy.unavailable[line.reason ?? 'missing']}</p>
              ) : (
                <p className="mt-1 text-sm text-gray-700" dir="ltr">
                  {formatPrice(line.unitPrice, currency, locale)}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`qty-${line.variantId}`}>{copy.qty}</label>
                <input
                  id={`qty-${line.variantId}`}
                  type="number"
                  min={1}
                  max={Math.max(1, line.stock)}
                  defaultValue={line.qty}
                  dir="ltr"
                  disabled={!line.available || busyId === line.variantId}
                  onBlur={(e) => {
                    const next = Number(e.target.value) || 1;
                    if (next !== line.qty) void mutate(line.variantId, next);
                  }}
                  className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void mutate(line.variantId, 0)}
                  aria-label={copy.remove}
                  className="rounded p-1.5 text-red-600 hover:bg-red-50"
                  data-test-id={`cart-remove-${line.variantId}`}
                >
                  {busyId === line.variantId ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 size={16} aria-hidden="true" />
                  )}
                </button>
              </div>

              {line.available && (
                <p className="font-medium text-gray-900" dir="ltr">
                  {formatPrice(line.lineTotal, currency, locale)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <aside className="h-fit rounded-lg border border-gray-200 p-5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">{copy.subtotal}</span>
          <span className="font-semibold text-gray-900" dir="ltr">
            {formatPrice(cart.subtotal, currency, locale)}
          </span>
        </div>
        {cart.bundleDiscount > 0 && (
          <div
            className="mt-2 flex justify-between text-sm text-green-700"
            data-test-id="cart-bundle-saving"
          >
            <span>{copy.bundleSaving}</span>
            <span dir="ltr">− {formatPrice(cart.bundleDiscount, currency, locale)}</span>
          </div>
        )}

        <p className="mt-2 text-xs text-gray-500">{copy.shippingNote}</p>

        {cart.hasUnavailable && (
          <p className="mt-3 text-sm text-red-600">{copy.fixFirst}</p>
        )}

        <Link
          href={cart.hasUnavailable || cart.itemCount === 0 ? '#' : `/${locale}/checkout`}
          aria-disabled={cart.hasUnavailable || cart.itemCount === 0}
          className={`mt-4 block rounded-lg px-6 py-3 text-center text-sm font-medium text-white ${
            cart.hasUnavailable || cart.itemCount === 0
              ? 'pointer-events-none bg-gray-300'
              : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
          data-test-id="cart-checkout"
        >
          {pending ? '…' : copy.checkout}
        </Link>
      </aside>
    </div>
  );
}
