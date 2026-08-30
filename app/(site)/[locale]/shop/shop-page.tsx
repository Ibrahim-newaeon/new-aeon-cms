// app/(site)/[locale]/shop/shop-page.tsx
import { getSettings } from '@/lib/db/queries';
import { listShopProducts, getShopFacets } from '@/lib/commerce/storefront';
import { parseShopParams, hasActiveFilters } from '@/lib/commerce/shop-query';
import { ShopGrid } from '@/components/site/shop-grid';
import {
  ShopFilterPanel, ShopChips, ShopSortLinks, shopCopy,
} from '@/components/site/shop-filters';
import { ShopFilterSheet } from '@/components/site/shop-filter-sheet';
import type { SearchParams } from '@/lib/commerce/shop-query';
import type { Locale } from '@/lib/env';

/**
 * The shop, filtered.
 *
 * Shared by /shop and /shop/[category] so the two cannot drift: the category
 * page is the same page with the category taken from the path instead of the
 * query, which is also why the category control links to a path.
 */
export async function ShopPageBody({
  locale,
  searchParams,
  categoryFromPath,
  title,
}: {
  locale: Locale;
  searchParams: SearchParams;
  categoryFromPath?: string;
  title: string;
}) {
  const settings = await getSettings();
  const currency = settings?.currency ?? 'JOD';
  const filters = parseShopParams(searchParams, currency, categoryFromPath);

  const [items, facets] = await Promise.all([
    listShopProducts(locale, filters),
    getShopFacets(locale, filters),
  ]);

  const c = shopCopy(locale);

  // On a /shop/[category] page the category came from the URL itself, so it is
  // not something the bar should offer to remove — leaving it out of the count
  // keeps the "2 filters" badge honest.
  const panelFilters = categoryFromPath ? { ...filters, category: undefined } : filters;
  const appliedCount = [
    !categoryFromPath && filters.category,
    filters.brand,
    filters.minPrice != null || filters.maxPrice != null,
    filters.inStock,
    filters.onSale,
  ].filter(Boolean).length;

  const panel = (
    <ShopFilterPanel locale={locale} currency={currency} filters={filters} facets={facets} />
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold text-site-ink">{title}</h1>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Logical `start`, so the sidebar sits on the right in Arabic without
            a second stylesheet. */}
        <aside className="hidden w-60 shrink-0 lg:block" data-test-id="shop-sidebar">
          {panel}
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShopFilterSheet label={c.filters} close={c.clearAll} applied={appliedCount}>
                {panel}
              </ShopFilterSheet>
              <p className="text-sm text-site-ink-muted tabular-nums" data-test-id="shop-count">
                {c.count(facets.total)}
              </p>
            </div>
            <ShopSortLinks locale={locale} currency={currency} filters={filters} />
          </div>

          {hasActiveFilters(panelFilters) && (
            <div className="mt-4">
              <ShopChips
                locale={locale}
                currency={currency}
                filters={panelFilters}
                facets={facets}
              />
            </div>
          )}

          <div className="mt-6">
            {items.length === 0 && hasActiveFilters(filters) ? (
              // Not the generic "no products yet" — the shop HAS products, the
              // filters are what emptied it, so the way out is offered here.
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm text-site-ink-muted">{c.empty}</p>
                <p className="text-sm text-site-ink-muted">{c.clearToSee}</p>
              </div>
            ) : (
              <ShopGrid items={items} locale={locale} currency={currency} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
