// components/site/price.tsx
import { formatPrice } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * A price, pointing the right way.
 *
 * Every price on the storefront was wrapped in `dir="ltr"`. That is right for
 * English — "JOD 41.000" is a left-to-right run — and wrong for Arabic, where
 * Intl returns ‏٤١٫٠٠٠ د.أ.‏ already carrying U+200F marks at both ends. Forcing
 * LTR over those makes the bidi algorithm reorder a string that was already
 * ordered: the same price laid out 74px wide instead of 52, with the currency
 * pushed to the wrong side.
 *
 * So the direction follows the locale, and it lives here rather than at
 * twenty-odd call sites where the next one added will get it wrong again.
 */
export function Price({
  amount,
  currency,
  locale,
  className,
  strike,
  prefix,
  testId,
}: {
  amount: number;
  currency: string;
  locale: 'ar' | 'en';
  className?: string;
  /** The old price, shown struck through. */
  strike?: boolean;
  /** e.g. "−" on a discount line. Kept inside the run so it cannot detach. */
  prefix?: string;
  testId?: string;
}) {
  return (
    <span
      // Arabic prices carry their own direction; only the Latin form needs the
      // override.
      dir={locale === 'ar' ? undefined : 'ltr'}
      className={cn(strike && 'line-through', className)}
      data-test-id={testId}
    >
      {prefix ? `${prefix} ` : ''}
      {formatPrice(amount, currency, locale)}
    </span>
  );
}
