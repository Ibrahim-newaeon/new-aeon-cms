// app/(site)/[locale]/account/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { commerceEnabled } from '@/lib/commerce/guard';
import { currentCustomer } from '@/lib/auth/customer-session';
import { getCustomer } from '@/lib/commerce/customers';
import { AccountLogin } from '@/components/site/account-login';
import { AccountSignOut } from '@/components/site/account-sign-out';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
import { formatPhone } from '@/lib/commerce/phone';
import { STATUS_LABEL } from '@/lib/commerce/order-status';
import { locales, type Locale } from '@/lib/env';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'حسابي' : 'My account',
    // A signed-in page has nothing for a crawler and should never be cached
    // by one.
    robots: { index: false, follow: false },
  };
}

/**
 * The shopper's own order history.
 *
 * The whole point of a shopper account here: the shop already knows every
 * order this phone number placed, and until now the only way to see one was
 * the link in the confirmation.
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  if (!(await commerceEnabled())) notFound();

  const typedLocale = locale as Locale;
  const session = await currentCustomer();

  if (!session) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <AccountLogin locale={typedLocale} />
      </div>
    );
  }

  const [record, settings] = await Promise.all([getCustomer(session.sub), getSettings()]);

  // The session is valid but the customer is gone — treat it as signed out
  // rather than rendering an empty shell.
  if (!record) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <AccountLogin locale={typedLocale} />
      </div>
    );
  }

  const currency = settings?.currency ?? 'JOD';
  const ar = typedLocale === 'ar';
  const dateFmt = ar ? 'ar-JO' : 'en-GB';

  return (
    <div className="mx-auto max-w-4xl px-4 py-16" data-test-id="account-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-site-ink">
            {record.customer.name || (ar ? 'حسابي' : 'My account')}
          </h1>
          <p className="mt-1 font-mono text-sm text-site-ink-muted" dir="ltr">
            {formatPhone(record.customer.phone)}
          </p>
        </div>
        <AccountSignOut locale={typedLocale} />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-site-ink">
        {ar ? 'طلباتي' : 'My orders'}
      </h2>

      {record.orders.length === 0 ? (
        <p className="mt-3 text-sm text-site-ink-muted">
          {ar ? 'لا توجد طلبات بعد.' : 'No orders yet.'}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3" data-test-id="account-orders">
          {record.orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/${typedLocale}/order/${order.orderNumber}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-site-line p-4 transition-colors hover:bg-site-surface-raised"
              >
                <span className="font-mono text-sm text-site-ink" dir="ltr">
                  {order.orderNumber}
                </span>
                <span className="text-sm text-site-ink-muted">
                  {STATUS_LABEL[order.status][typedLocale]}
                </span>
                <span className="text-sm text-site-ink" dir="ltr">
                  {formatPrice(order.total, currency, typedLocale)}
                </span>
                <span className="text-sm text-site-ink-muted">
                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString(dateFmt) : '—'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
