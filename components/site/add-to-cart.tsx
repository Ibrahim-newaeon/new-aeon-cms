// components/site/add-to-cart.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShoppingBag, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectableVariant {
  id: string;
  sku: string;
  stock: number;
  /** option name -> value, e.g. { Size: "50ml", Cap: "Gold" } */
  values: Record<string, string>;
}

const COPY = {
  ar: {
    add: 'أضف إلى السلة',
    adding: 'جارٍ الإضافة…',
    added: 'أُضيف إلى السلة',
    viewCart: 'عرض السلة',
    choose: 'اختر',
    unavailable: 'هذه التركيبة غير متوفّرة',
    outOfStock: 'نفدت الكمية',
    failed: 'تعذّرت الإضافة. حاول مرة أخرى.',
  },
  en: {
    add: 'Add to cart',
    adding: 'Adding…',
    added: 'Added to cart',
    viewCart: 'View cart',
    choose: 'Choose',
    unavailable: 'That combination is unavailable',
    outOfStock: 'Out of stock',
    failed: 'Could not add. Try again.',
  },
} as const;

export function AddToCart({
  options,
  variants,
  locale,
}: {
  options: { id: string; name: string; values: string[] }[];
  variants: SelectableVariant[];
  locale: 'ar' | 'en';
}) {
  const router = useRouter();
  const copy = COPY[locale];

  // Preselect the first in-stock variant so a single-variant product is one click.
  const initial = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selection, setSelection] = useState<Record<string, string>>(initial?.values ?? {});
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  // A selection maps to a variant only when EVERY axis matches — a partial
  // selection is not a purchasable thing.
  const matched = variants.find((v) =>
    options.every((o) => v.values[o.name] === selection[o.name])
  );

  const canAdd = Boolean(matched && matched.stock > 0);

  const add = async () => {
    if (!matched) return;
    setState('busy');
    try {
      const res = await fetch('/api/commerce/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'add', variantId: matched.id, qty: 1 }),
      });
      if (!res.ok) throw new Error('failed');
      setState('done');
      router.refresh();
      window.setTimeout(() => setState('idle'), 2500);
    } catch {
      setState('error');
    }
  };

  return (
    <div className="space-y-4">
      {options.map((option) => (
        <div key={option.id}>
          <p className="mb-1 text-sm font-medium text-gray-700">{option.name}</p>
          <div className="flex flex-wrap gap-2">
            {option.values.map((v) => {
              const on = selection[option.name] === v;
              // Grey out a value that leads to no in-stock variant given the
              // rest of the current selection.
              const reachable = variants.some(
                (variant) =>
                  variant.values[option.name] === v &&
                  variant.stock > 0 &&
                  options.every(
                    (o) => o.name === option.name || variant.values[o.name] === selection[o.name]
                  )
              );

              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${option.name}: ${v}`}
                  onClick={() => setSelection((s) => ({ ...s, [option.name]: v }))}
                  data-test-id={`opt-${option.name}-${v}`}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm transition-colors',
                    on
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50',
                    !reachable && !on && 'opacity-40'
                  )}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {!matched && options.length > 0 && (
        <p className="text-sm text-gray-500">{copy.unavailable}</p>
      )}
      {matched && matched.stock <= 0 && (
        <p className="text-sm text-red-600">{copy.outOfStock}</p>
      )}
      {state === 'error' && <p role="alert" className="text-sm text-red-600">{copy.failed}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void add()}
          disabled={!canAdd || state === 'busy'}
          data-test-id="add-to-cart"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {state === 'busy' ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : state === 'done' ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <ShoppingBag size={16} aria-hidden="true" />
          )}
          {state === 'busy' ? copy.adding : state === 'done' ? copy.added : copy.add}
        </button>

        {state === 'done' && (
          <a href={`/${locale}/cart`} className="text-sm text-indigo-600 hover:underline">
            {copy.viewCart}
          </a>
        )}
      </div>
    </div>
  );
}
