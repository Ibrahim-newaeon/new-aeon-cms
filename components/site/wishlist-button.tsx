'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, X } from 'lucide-react';

const COPY = {
  /**
   * "Wishlist", not "Saved". Shoppers go looking for a wishlist, and a tab
   * labelled Saved reads as something else — the feature was reported missing
   * while sitting right there under the other name.
   */
  ar: { save: 'أضف للمفضّلة', saved: 'في المفضّلة', remove: 'إزالة', signIn: 'سجّل الدخول لحفظ المنتجات' },
  en: { save: 'Add to wishlist', saved: 'In your wishlist', remove: 'Remove', signIn: 'Sign in to save products' },
} as const;

async function toggle(productId: string, saved: boolean) {
  const res = await fetch('/api/account/wishlist', {
    method: saved ? 'DELETE' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ productId }),
  });
  return { ok: res.ok, status: res.status };
}

/**
 * Save a product, from the product page.
 *
 * Optimistic, then corrected if the server disagrees. A heart that waits for a
 * round-trip before filling in feels broken, and the cost of being wrong here
 * is one icon flicking back — not a lost order.
 */
export function WishlistButton({
  productId,
  locale,
  initial,
  signedIn,
}: {
  productId: string;
  locale: 'ar' | 'en';
  initial: boolean;
  signedIn: boolean;
}) {
  const c = COPY[locale];
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();

  if (!signedIn) {
    return (
      <a
        href={`/${locale}/account`}
        className="inline-flex items-center gap-2 text-sm text-site-ink-muted underline underline-offset-2"
        data-test-id="wishlist-signin"
      >
        <Heart size={16} aria-hidden="true" />
        {c.signIn}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={saved}
      disabled={pending}
      data-test-id="wishlist-toggle"
      onClick={() => {
        const next = !saved;
        setSaved(next);
        start(async () => {
          const { ok, status } = await toggle(productId, saved);
          if (!ok) {
            setSaved(!next);
            // The session expired while the page sat open; send them to sign in
            // rather than leaving a button that silently does nothing.
            if (status === 401) router.push(`/${locale}/account`);
          }
        });
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-site-line px-4 py-2.5 text-sm transition-colors hover:bg-site-surface-raised"
    >
      <Heart
        size={16}
        aria-hidden="true"
        className={saved ? 'fill-site-accent text-site-accent' : ''}
      />
      {saved ? c.saved : c.save}
    </button>
  );
}

/** The X on a wishlist row. */
export function WishlistRemove({ productId, locale }: { productId: string; locale: 'ar' | 'en' }) {
  const c = COPY[locale];
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-label={c.remove}
      disabled={pending}
      data-test-id="wishlist-remove"
      onClick={() =>
        start(async () => {
          await toggle(productId, true);
          router.refresh();
        })
      }
      className="shrink-0 rounded p-1 text-site-ink-muted hover:text-site-danger"
    >
      <X size={16} aria-hidden="true" />
    </button>
  );
}
