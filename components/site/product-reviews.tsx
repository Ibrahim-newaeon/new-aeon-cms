'use client';

import { useState } from 'react';
import { Star, Loader2 } from 'lucide-react';

export interface PublicReview {
  id: string;
  customerName: string;
  rating: number;
  body: string;
  createdAt: string | null;
}

export interface ReviewSummaryView {
  average: number;
  count: number;
  distribution: Record<number, number>;
}

const COPY = {
  ar: {
    title: 'تقييمات العملاء',
    none: 'لا توجد تقييمات بعد. كن أول من يشارك رأيه.',
    outOf: 'من ٥',
    reviews: 'تقييم',
    write: 'اكتب تقييماً',
    name: 'الاسم',
    phone: 'رقم الهاتف',
    rating: 'التقييم',
    body: 'رأيك بالمنتج',
    submit: 'إرسال التقييم',
    sending: 'جارٍ الإرسال…',
    // Says "under review", never "published" — promising visibility that
    // moderation has not granted is how a shop looks broken.
    thanks: 'شكراً لك. سيظهر تقييمك بعد مراجعته.',
    failed: 'تعذّر إرسال التقييم.',
    starOf: (n: number) => `${n} من ٥`,
  },
  en: {
    title: 'Customer reviews',
    none: 'No reviews yet. Be the first to share your thoughts.',
    outOf: 'out of 5',
    reviews: 'reviews',
    write: 'Write a review',
    name: 'Name',
    phone: 'Phone number',
    rating: 'Rating',
    body: 'Your thoughts on the product',
    submit: 'Submit review',
    sending: 'Sending…',
    thanks: 'Thank you. Your review will appear once it has been checked.',
    failed: 'Could not submit the review.',
    starOf: (n: number) => `${n} out of 5`,
  },
} as const;

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex" role="img" aria-label={label}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={15}
          aria-hidden="true"
          className={i < Math.round(value) ? 'fill-current text-site-warning' : 'text-site-ink-inverted/70'}
        />
      ))}
    </span>
  );
}

export function ProductReviews({
  productId,
  locale,
  summary,
  reviews,
}: {
  productId: string;
  locale: 'ar' | 'en';
  summary: ReviewSummaryView;
  reviews: PublicReview[];
}) {
  const copy = COPY[locale];
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    setState('busy');
    setError(null);

    try {
      const res = await fetch('/api/commerce/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          productId,
          name: form.get('name'),
          phone: form.get('phone'),
          rating,
          body: form.get('body'),
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) throw new Error(data?.error?.message ?? copy.failed);

      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.failed);
      setState('idle');
    }
  }

  return (
    <section className="mt-12 border-t border-site-line pt-8" data-test-id="product-reviews">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-site-ink">{copy.title}</h2>

        {!open && state !== 'done' && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-site-line px-4 py-2 text-sm hover:bg-site-surface-raised"
            data-test-id="review-open"
          >
            {copy.write}
          </button>
        )}
      </div>

      {summary.count > 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-site-ink-muted" data-test-id="review-summary">
          <Stars value={summary.average} label={copy.starOf(summary.average)} />
          <span dir="ltr" className="font-semibold">
            {summary.average}
          </span>
          <span className="text-site-ink-muted">
            {copy.outOf} · <span dir="ltr">{summary.count}</span> {copy.reviews}
          </span>
        </p>
      )}

      {state === 'done' ? (
        <p className="mt-6 rounded-lg bg-site-success/10 p-4 text-sm text-site-success" role="status" data-test-id="review-thanks">
          {copy.thanks}
        </p>
      ) : (
        open && (
          <form onSubmit={submit} method="post" className="mt-6 grid gap-4 sm:grid-cols-2" data-test-id="review-form">
            {error && (
              <p role="alert" className="sm:col-span-2 rounded-lg bg-site-danger/10 p-3 text-sm text-site-danger">
                {error}
              </p>
            )}

            <label className="text-sm">
              <span className="mb-1 block text-site-ink-muted">{copy.name}</span>
              <input name="name" required minLength={2} className="w-full rounded-lg border border-site-line p-2.5" data-test-id="review-name" />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-site-ink-muted">{copy.phone}</span>
              <input name="phone" required dir="ltr" className="w-full rounded-lg border border-site-line p-2.5 text-start" data-test-id="review-phone" />
            </label>

            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm text-site-ink-muted">{copy.rating}</legend>
              <div className="flex gap-1" role="radiogroup">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={copy.starOf(n)}
                    onClick={() => setRating(n)}
                    data-test-id={`review-star-${n}`}
                    className="p-1"
                  >
                    <Star
                      size={22}
                      aria-hidden="true"
                      className={n <= rating ? 'fill-current text-site-warning' : 'text-site-ink-inverted/70'}
                    />
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-site-ink-muted">{copy.body}</span>
              <textarea name="body" required minLength={10} rows={4} className="w-full rounded-lg border border-site-line p-2.5" data-test-id="review-body" />
            </label>

            <button
              type="submit"
              disabled={state === 'busy'}
              className="inline-flex items-center gap-2 rounded-lg bg-site-accent px-5 py-2.5 text-sm font-medium text-site-accent-ink hover:bg-site-accent-hover disabled:bg-site-line"
              data-test-id="review-submit"
            >
              {state === 'busy' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {state === 'busy' ? copy.sending : copy.submit}
            </button>
          </form>
        )
      )}

      {reviews.length === 0 ? (
        <p className="mt-6 text-sm text-site-ink-muted">{copy.none}</p>
      ) : (
        <ul className="mt-6 space-y-5">
          {reviews.map((review) => (
            <li key={review.id} className="border-b border-site-line pb-5 last:border-0" data-test-id={`review-item-${review.id}`}>
              <div className="flex items-center gap-2">
                <Stars value={review.rating} label={copy.starOf(review.rating)} />
                <span className="text-sm font-medium text-site-ink">{review.customerName}</span>
                {review.createdAt && (
                  <time className="text-xs text-site-ink-muted" dir="ltr">
                    {new Date(review.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-JO' : 'en-GB')}
                  </time>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-site-ink-muted">{review.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
