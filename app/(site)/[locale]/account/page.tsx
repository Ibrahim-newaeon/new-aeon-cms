// app/(site)/[locale]/account/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { currentCustomer } from '@/lib/auth/customer-session';
import { getCustomer } from '@/lib/commerce/customers';
import { wishlistCount } from '@/lib/account/profile';
import { AccountAuth } from '@/components/site/account-auth';
import { AccountSignOut } from '@/components/site/account-sign-out';
import { AccountNav } from '@/components/site/account-nav';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
import { formatPhone } from '@/lib/commerce/phone';
import { STATUS_LABEL } from '@/lib/commerce/order-status';
import type { Locale } from '@/lib/env';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'حسابي' : 'My account',
    robots: { index: false, follow: false },
  };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = locale as Locale;
  const session = await currentCustomer();

  if (!session) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <AccountAuth locale={typedLocale} />
      </div>
    );
  }

  const [record, settings, saved] = await Promise.all([
    getCustomer(session.sub),
    getSettings(),
    wishlistCount(session.sub),
  ]);

  // Valid session, customer gone: treat as signed out rather than an empty shell.
  if (!record) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <AccountAuth locale={typedLocale} />
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

      <div className="mt-8">
        <AccountNav locale={typedLocale} current="orders" wishlistCount={saved} />
      </div>

      {record.orders.length === 0 ? (
        <p className="mt-6 text-sm text-site-ink-muted">
          {ar ? 'لا توجد طلبات بعد.' : 'No orders yet.'}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3" data-test-id="account-orders">
          {record.orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/${typedLocale}/order/${order.orderNumber}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-site-line p-4 transition-colors hover:bg-site-surface-raised"
              >
                <span className="font-mono text-sm text-site-ink" dir="ltr">{order.orderNumber}</span>
                <span className="text-sm text-site-ink-muted">
                  {STATUS_LABEL[order.status][typedLocale]}
                </span>
                <span className="text-sm text-site-ink" dir={typedLocale === 'ar' ? undefined : 'ltr'}>
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
