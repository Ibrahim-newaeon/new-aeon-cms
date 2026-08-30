// components/admin/commerce-stats.tsx
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { StatCard } from './stat-card';
import { formatPrice } from '@/lib/money';
import { TREND_WINDOW_DAYS } from '@/lib/admin/trend';
import type { CommerceStats } from '@/lib/commerce/dashboard';
import type { Translator } from '@/lib/admin-i18n';

/**
 * The shop's numbers on the admin dashboard.
 *
 * Rendered only when commerce is enabled, so a content-only site is not shown
 * four tiles reading zero.
 */
export function CommerceStatsPanel({
  stats,
  currency,
  locale,
  adminPath,
  t,
}: {
  stats: CommerceStats;
  currency: string;
  locale: 'ar' | 'en';
  adminPath: string;
  t: Translator;
}) {
  // Reuses the dashboard's existing trend wording rather than adding a second
  // phrasing for the same 30-day window.
  const trendLabel = t('dashboard.vsPrevious');
  const newLabel = t('dashboard.newThisPeriod');

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-test-id="commerce-stats">
        <StatCard
          title={t('dashboard.ordersWindow', { days: TREND_WINDOW_DAYS })}
          value={stats.orders.current}
          icon="bag"
          href={`${adminPath}/commerce/orders`}
          trend={stats.orders.trend}
          trendLabel={trendLabel}
          newLabel={newLabel}
        />
        <StatCard
          title={t('dashboard.revenueWindow', { days: TREND_WINDOW_DAYS })}
          value={formatPrice(stats.revenue.current, currency, locale)}
          icon="trending"
          href={`${adminPath}/commerce/orders`}
          trend={stats.revenue.trend}
          trendLabel={trendLabel}
          newLabel={newLabel}
        />
        <StatCard
          title={t('dashboard.pendingOrders')}
          value={stats.pending}
          icon="package"
          href={`${adminPath}/commerce/orders?status=pending`}
        />
      </div>

      {stats.lowStockCount > 0 && (
        <div className="admin-card" data-test-id="low-stock">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            <AlertTriangle size={16} aria-hidden="true" className="text-[var(--admin-accent)]" />
            {t('dashboard.lowStock', { count: stats.lowStockCount })}
          </h2>

          <ul className="flex flex-col gap-2">
            {stats.lowStock.map((row) => (
              <li key={row.sku}>
                <Link
                  href={`${adminPath}/commerce/products`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-bg)] p-3 text-sm transition-colors hover:border-[var(--admin-accent)]/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{row.productName}</span>
                    <span className="block truncate font-mono text-xs text-[var(--admin-text-muted)]" dir="ltr">
                      {row.sku}
                    </span>
                  </span>
                  {/* The threshold is shown beside the count: "2 left" means
                      nothing without the number the shop chose to worry at. */}
                  <span className="shrink-0 tabular-nums text-[var(--admin-text-secondary)]">
                    {t('dashboard.stockOfThreshold', { stock: row.stock, threshold: row.threshold })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {stats.lowStockCount > stats.lowStock.length && (
            <p className="mt-3 text-sm text-[var(--admin-text-muted)]">
              {t('dashboard.andMoreLowStock', {
                count: stats.lowStockCount - stats.lowStock.length,
              })}
            </p>
          )}
        </div>
      )}
    </>
  );
}
