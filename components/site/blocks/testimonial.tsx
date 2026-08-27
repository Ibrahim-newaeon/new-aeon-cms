// components/site/blocks/testimonial.tsx
// Server Component — no interactivity, so no 'use client'.
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseTestimonialBlock, type TestimonialItemInput } from '@/lib/blocks/testimonial';

interface TestimonialBlockProps {
  /** Raw block JSON straight out of `contentI18n.body`. Validated here. */
  block: unknown;
}

const COLUMN_CLASSES: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
};

export function TestimonialBlock({ block }: TestimonialBlockProps) {
  const data = parseTestimonialBlock(block);

  // Malformed or legacy JSON degrades silently rather than breaking the page.
  if (!data) return null;

  return (
    <section
      className={cn('grid gap-6 my-8', COLUMN_CLASSES[data.columns])}
      data-test-id="testimonial-block"
    >
      {data.items.map((item, idx) => (
        <TestimonialCard key={`${item.author}-${idx}`} item={item} index={idx} />
      ))}
    </section>
  );
}

function TestimonialCard({ item, index }: { item: TestimonialItemInput; index: number }) {
  return (
    <figure
      className="flex flex-col gap-4 h-full rounded-lg border border-gray-200 bg-white p-6 text-start shadow-sm"
      data-test-id={`testimonial-item-${index}`}
    >
      {item.rating !== undefined && <StarRating rating={item.rating} />}

      {/* border-s-4 / ps-4 are logical — they flip automatically under dir="rtl". */}
      <blockquote className="flex-1 border-s-4 border-indigo-500 ps-4 text-gray-700 leading-relaxed">
        {item.quote}
      </blockquote>

      <figcaption className="flex items-center gap-3">
        {item.avatar ? (
          <img
            src={item.avatar}
            alt=""
            aria-hidden="true"
            loading="lazy"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700"
          >
            {item.author.trim().charAt(0)}
          </span>
        )}

        <span className="min-w-0">
          <span className="block truncate font-medium text-gray-900">{item.author}</span>
          {item.role && (
            <span className="block truncate text-sm text-gray-500">{item.role}</span>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div
      role="img"
      // Digits inside Arabic copy scramble without an explicit LTR context,
      // hence the isolate + the dir="ltr" wrapper on the star row.
      aria-label={`التقييم: ${rating} من 5`}
      dir="ltr"
      className="flex items-center gap-0.5 self-start"
      data-test-id="testimonial-rating"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={16}
          aria-hidden="true"
          className={cn(
            star <= rating ? 'fill-amber-400 text-amber-400' : 'fill-none text-gray-300'
          )}
        />
      ))}
    </div>
  );
}
