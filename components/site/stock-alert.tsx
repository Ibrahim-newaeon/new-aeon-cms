'use client';

import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';

const COPY = {
  ar: {
    prompt: 'غير متوفّر حالياً — أعلمني عند توفّره',
    email: 'بريدك الإلكتروني',
    submit: 'أعلمني',
    sending: 'جارٍ التسجيل…',
    done: 'سنُعلمك برسالة واحدة عند توفّره.',
    inStock: 'المنتج متوفّر الآن.',
    failed: 'تعذّر التسجيل.',
  },
  en: {
    prompt: 'Out of stock — tell me when it is back',
    email: 'Your email',
    submit: 'Notify me',
    sending: 'Saving…',
    done: 'We will send one email when it is back.',
    inStock: 'This is available now.',
    failed: 'Could not sign you up.',
  },
} as const;

/**
 * Shown only when the selected variant has run out.
 *
 * The confirmation promises exactly one email, which is what the server
 * actually does — `notified_at` is set on send so a later restock does not
 * mail the same person again.
 */
export function StockAlert({
  variantId,
  locale,
}: {
  variantId: string;
  locale: 'ar' | 'en';
}) {
  const copy = COPY[locale];
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get('email');

    setState('busy');
    setError(null);

    try {
      const res = await fetch('/api/commerce/stock-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ variantId, email, locale }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error?.code === 'IN_STOCK' ? copy.inStock : (data?.error?.message ?? copy.failed)
        );
      }

      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.failed);
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <p
        role="status"
        className="rounded-lg bg-green-50 p-3 text-sm text-green-800"
        data-test-id="stock-alert-done"
      >
        {copy.done}
      </p>
    );
  }

  return (
    <form onSubmit={submit} method="post" className="space-y-2" data-test-id="stock-alert-form">
      <p className="flex items-center gap-2 text-sm text-gray-700">
        <BellRing size={15} aria-hidden="true" />
        {copy.prompt}
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          name="email"
          type="email"
          required
          dir="ltr"
          placeholder={copy.email}
          className="min-w-[200px] flex-1 rounded-lg border border-gray-300 p-2.5 text-start text-sm"
          data-test-id="stock-alert-email"
        />
        <button
          type="submit"
          disabled={state === 'busy'}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-300"
          data-test-id="stock-alert-submit"
        >
          {state === 'busy' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {state === 'busy' ? copy.sending : copy.submit}
        </button>
      </div>
    </form>
  );
}
