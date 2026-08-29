'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Check, ShoppingBag } from 'lucide-react';
import { formatPrice } from '@/lib/money';

export interface PublicBundle {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  partsTotal: number;
  available: boolean;
}

const COPY = {
  ar: {
    add: 'أضف الحزمة',
    adding: 'جارٍ الإضافة…',
    added: 'أُضيفت',
    viewCart: 'عرض السلة',
    save: 'توفير',
    was: 'بدلاً من',
    unavailable: 'غير متوفّرة حالياً',
    failed: 'تعذّرت الإضافة.',
  },
  en: {
    add: 'Add bundle',
    adding: 'Adding…',
    added: 'Added',
    viewCart: 'View cart',
    save: 'Save',
    was: 'instead of',
    unavailable: 'Not available right now',
    failed: 'Could not add the bundle.',
  },
} as const;

export function BundleCard({
  bundle,
  locale,
  currency,
}: {
  bundle: PublicBundle;
  locale: 'ar' | 'en';
  currency: string;
}) {
  const copy = COPY[locale];
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const saving = Math.max(0, bundle.partsTotal - bundle.price);

  async function add() {
    setState('busy');
    setError(null);

    try {
      const res = await fetch('/api/commerce/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'add-bundle', bundleId: bundle.id }),
      });
      if (!res.ok) throw new Error(copy.failed);

      setState('done');
      router.refresh();
    } catch {
      setError(copy.failed);
      setState('idle');
    }
  }

  return (
    <li
      className="flex flex-col overflow-hidden rounded-lg border border-gray-200"
      data-test-id={`bundle-card-${bundle.id}`}
    >
      {bundle.image && (
        <div className="relative aspect-square w-full">
          <Image
            src={bundle.image}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="font-semibold text-gray-900">{bundle.name}</h2>

        {bundle.description && <p className="text-sm text-gray-600">{bundle.description}</p>}

        <p className="mt-auto flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-semibold text-gray-900" dir="ltr">
            {formatPrice(bundle.price, currency, locale)}
          </span>

          {saving > 0 && (
            <>
              <span className="text-sm text-gray-400 line-through" dir="ltr">
                {formatPrice(bundle.partsTotal, currency, locale)}
              </span>
              <span className="text-sm font-medium text-green-700" dir="ltr">
                {copy.save} {formatPrice(saving, currency, locale)}
              </span>
            </>
          )}
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {!bundle.available ? (
          <p className="text-sm text-red-600">{copy.unavailable}</p>
        ) : state === 'done' ? (
          <a href={`/${locale}/cart`} className="text-sm text-indigo-600 hover:underline" data-test-id={`bundle-added-${bundle.id}`}>
            <Check size={15} aria-hidden="true" className="me-1 inline" />
            {copy.viewCart}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void add()}
            disabled={state === 'busy'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-300"
            data-test-id={`bundle-add-${bundle.id}`}
          >
            {state === 'busy' ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <ShoppingBag size={15} aria-hidden="true" />
            )}
            {state === 'busy' ? copy.adding : copy.add}
          </button>
        )}
      </div>
    </li>
  );
}
