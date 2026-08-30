// app/(admin)/admin/commerce/customers/[id]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getCustomer } from '@/lib/commerce/customers';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
import { formatPhone } from '@/lib/commerce/phone';
import { STATUS_LABEL } from '@/lib/commerce/order-status';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export const dynamic = 'force-dynamic';

/** One customer and everything they have ordered. */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const locale = await getAdminLocale();
  const t = createTranslator(locale);

  const [record, settings] = await Promise.all([getCustomer(id), getSettings()]);
  if (!record) notFound();

  const currency = settings?.currency ?? 'JOD';
  const { customer, orders, totalSpent } = record;
  const dateFmt = locale === 'ar' ? 'ar-JO' : 'en-GB';

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`${ADMIN_PATH}/commerce/customers`}
        className="inline-flex items-center gap-1 text-sm text-[var(--admin-text-muted)] hover:underline"
      >
        <ArrowRight size={14} aria-hidden="true" className="rtl:rotate-180" />
        {t('nav.customers')}
      </Link>

      <div className="admin-card">
        <h1 className="text-2xl font-semibold">{customer.name || t('customers.unnamed')}</h1>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--admin-text-muted)]">
              {t('customers.phone')}
            </dt>
            <dd className="font-mono text-sm" dir="ltr">{formatPhone(customer.phone)}</dd>
          </div>
          {customer.email && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--admin-text-muted)]">
                {t('customers.email')}
              </dt>
              <dd className="text-sm" dir="ltr">{customer.email}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--admin-text-muted)]">
              {t('customers.spent')}
            </dt>
            {/* Cancelled and refunded orders are excluded — money that came
                back is not money this customer spent. */}
            <dd className="text-sm tabular-nums" dir="ltr">
              {formatPrice(totalSpent, currency, locale)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="admin-card p-0">
        <h2 className="p-4 font-medium">{t('customers.orderHistory', { count: orders.length })}</h2>
        {orders.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-[var(--admin-text-muted)]">
            {t('customers.noOrders')}
          </p>
        ) : (
          <table className="w-full text-sm" data-test-id="customer-orders">
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-[var(--admin-line)]">
                  <td className="p-3">
                    <Link
                      href={`${ADMIN_PATH}/commerce/orders/${order.id}`}
                      className="font-mono hover:underline"
                      dir="ltr"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="p-3 text-[var(--admin-text-secondary)]">
                    {STATUS_LABEL[order.status][locale]}
                  </td>
                  <td className="p-3 tabular-nums" dir="ltr">
                    {formatPrice(order.total, currency, locale)}
                  </td>
                  <td className="p-3 text-[var(--admin-text-muted)]">
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString(dateFmt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
