// components/site/order-lookup.tsx
import Link from 'next/link';

/**
 * Look up an order with its number and the phone it was placed with.
 *
 * Shown in place of the order when the visitor has not shown they may see it.
 * The wording is identical whether the order exists or not, because a page
 * that says "wrong phone" for a real number and "not found" for a fake one is
 * a way to discover which order numbers are real.
 *
 * A plain GET form: the phone lands in the query string of a noindex page,
 * which is the trade for letting a guest who has no account reach their own
 * order at all.
 */
const COPY = {
  ar: {
    title: 'تتبّع طلبك',
    intro: 'أدخل رقم الهاتف الذي استخدمته عند الطلب.',
    number: 'رقم الطلب',
    phone: 'رقم الهاتف',
    submit: 'عرض الطلب',
    signedIn: 'أو سجّل الدخول لعرض كل طلباتك.',
    account: 'حسابي',
  },
  en: {
    title: 'Track your order',
    intro: 'Enter the phone number you used when ordering.',
    number: 'Order number',
    phone: 'Phone number',
    submit: 'View order',
    signedIn: 'Or sign in to see all your orders.',
    account: 'My account',
  },
} as const;

export function OrderLookup({
  locale,
  orderNumber,
  notFound,
}: {
  locale: 'ar' | 'en';
  orderNumber?: string;
  /** False once a phone was tried, so the intro can become a retry prompt. */
  notFound?: boolean;
}) {
  const c = COPY[locale];

  return (
    <div className="mx-auto max-w-sm px-4 py-16" data-test-id="order-lookup">
      <h1 className="text-2xl font-bold text-site-ink">{c.title}</h1>
      <p className="mt-2 text-sm text-site-ink-muted">
        {notFound
          ? c.intro
          : locale === 'ar'
            ? 'تعذّر العثور على طلب بهذه البيانات. تأكّد من الرقم والهاتف.'
            : 'No order matches those details. Check the number and phone.'}
      </p>

      {/* When the number is already in the path the form submits to that same
          path with only the phone; the standalone page carries `n` instead. */}
      <form
        method="get"
        action={orderNumber ? undefined : `/${locale}/order`}
        className="mt-6 flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          {c.number}
          <input
            name={orderNumber ? undefined : 'n'}
            dir="ltr"
            required
            defaultValue={orderNumber ?? ''}
            readOnly={Boolean(orderNumber)}
            className="rounded-lg border border-site-line px-3 py-2.5 text-sm"
            data-test-id="lookup-number"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {c.phone}
          <input
            name="phone"
            type="tel"
            dir="ltr"
            required
            autoComplete="tel"
            className="rounded-lg border border-site-line px-3 py-2.5 text-sm"
            data-test-id="lookup-phone"
          />
        </label>
        <button type="submit" className="site-btn-primary justify-center" data-test-id="lookup-submit">
          {c.submit}
        </button>
      </form>

      <p className="mt-6 text-sm text-site-ink-muted">
        {c.signedIn}{' '}
        <Link href={`/${locale}/account`} className="underline underline-offset-2">
          {c.account}
        </Link>
      </p>
    </div>
  );
}
