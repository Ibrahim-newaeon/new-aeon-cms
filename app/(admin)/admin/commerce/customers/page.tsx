// app/(admin)/admin/commerce/customers/page.tsx
import Link from 'next/link';
import { Search } from 'lucide-react';
import { listCustomers } from '@/lib/commerce/customers';
import { getSettings } from '@/lib/db/queries';
import { formatPrice } from '@/lib/money';
import { formatPhone } from '@/lib/commerce/phone';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { ImportExport } from '@/components/admin/import-export';

const ADMIN_PATH = process.env.ADMIN_PATH || '/admin';

export const dynamic = 'force-dynamic';

/**
 * The customer list.
 *
 * The table has been filled by every checkout since the shop opened and nothing
 * in the admin ever read it. Export-only in import/export, and read-only here:
 * customers are created by placing an order, and the phone is the key that
 * decides whether two orders are one person.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const t = createTranslator(await getAdminLocale());
  const locale = await getAdminLocale();
  const params = await searchParams;
  const search = params.q?.trim() || undefined;
  const page = Number(params.page) || 1;

  const [result, settings] = await Promise.all([listCustomers({ search, page }), getSettings()]);
  const currency = settings?.currency ?? 'JOD';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('nav.customers')}</h1>
        <ImportExport entity="customers" canImport={false} />
      </div>

      {/* GET, so a search is linkable and the back button works. */}
      <form method="get" className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">{t('customers.search')}</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search ?? ''}
          placeholder={t('customers.searchHint')}
          className="admin-input max-w-sm"
          data-test-id="customer-search"
        />
        <button type="submit" className="admin-btn-ghost">
          <Search size={16} aria-hidden="true" />
          {t('common.search')}
        </button>
      </form>

      {result.rows.length === 0 ? (
        <p className="text-sm text-[var(--admin-text-muted)]" data-test-id="customers-empty">
          {search ? t('customers.noMatches') : t('customers.none')}
        </p>
      ) : (
        <div className="admin-card overflow-x-auto p-0">
          <table className="w-full text-sm" data-test-id="customers-table">
            <thead>
              <tr className="border-b border-[var(--admin-line)] text-start text-xs uppercase tracking-wide text-[var(--admin-text-muted)]">
                <th className="p-3 text-start font-medium">{t('customers.name')}</th>
                <th className="p-3 text-start font-medium">{t('customers.phone')}</th>
                <th className="p-3 text-start font-medium">{t('customers.orders')}</th>
                <th className="p-3 text-start font-medium">{t('customers.spent')}</th>
                <th className="p-3 text-start font-medium">{t('customers.lastOrder')}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--admin-line)] last:border-b-0 hover:bg-[var(--admin-elevated)]"
                >
                  <td className="p-3">
                    <Link
                      href={`${ADMIN_PATH}/commerce/customers/${row.id}`}
                      className="font-medium hover:underline"
                      data-test-id="customer-link"
                    >
                      {row.name || t('customers.unnamed')}
                    </Link>
                    {row.email && (
                      <span className="block text-xs text-[var(--admin-text-muted)]" dir="ltr">
                        {row.email}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{formatPhone(row.phone)}</td>
                  <td className="p-3 tabular-nums">{row.orderCount}</td>
                  <td className="p-3 tabular-nums" dir="ltr">
                    {formatPrice(row.totalSpent, currency, locale)}
                  </td>
                  <td className="p-3 text-[var(--admin-text-secondary)]">
                    {row.lastOrderAt
                      ? new Date(row.lastOrderAt).toLocaleDateString(
                          locale === 'ar' ? 'ar-JO' : 'en-GB'
                        )
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.pageCount > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {Array.from({ length: result.pageCount }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(n) })}`}
              aria-current={n === result.page ? 'page' : undefined}
              className={
                n === result.page
                  ? 'rounded bg-[var(--admin-accent)]/15 px-2 py-1 font-medium'
                  : 'rounded px-2 py-1 text-[var(--admin-text-muted)] hover:bg-[var(--admin-elevated)]'
              }
            >
              {n}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
