// components/site/shop-filters.tsx
import Link from 'next/link';
import { formatPrice } from '@/lib/money';
import { shopHref, fromMinor, hasActiveFilters } from '@/lib/commerce/shop-query';
import type { ShopFilters, ShopFacets, ShopSort } from '@/lib/commerce/storefront';

/**
 * Every control is a LINK to this page with one parameter changed.
 *
 * Not a form and not React state: the URL is the state, so the back button,
 * sharing and a JavaScript-free browser all work without anything extra, and
 * there is no per-checkbox spinner because the grid is a server render Next
 * swaps in.
 *
 * The bar is written for RTL from the start — logical properties throughout, no
 * `left`/`right` — because mirroring a left-to-right filter panel afterwards is
 * how Arabic shops end up with the panel on the wrong edge.
 */

const COPY = {
  ar: {
    filters: 'التصفية',
    category: 'التصنيف',
    allCategories: 'كل التصنيفات',
    brand: 'العلامة',
    allBrands: 'كل العلامات',
    price: 'السعر',
    min: 'من',
    max: 'إلى',
    apply: 'تطبيق',
    inStock: 'المتوفر فقط',
    onSale: 'العروض فقط',
    clearAll: 'مسح الكل',
    count: (n: number) => (n === 1 ? 'منتج واحد' : n === 2 ? 'منتجان' : `${n} منتج`),
    sort: 'الترتيب',
    sorts: {
      featured: 'المميّزة',
      newest: 'الأحدث',
      'price-asc': 'الأقل سعراً',
      'price-desc': 'الأعلى سعراً',
    } as Record<ShopSort, string>,
    empty: 'لا توجد منتجات مطابقة.',
    clearToSee: 'امسح التصفية لعرض كل المنتجات.',
  },
  en: {
    filters: 'Filters',
    category: 'Category',
    allCategories: 'All categories',
    brand: 'Brand',
    allBrands: 'All brands',
    price: 'Price',
    min: 'Min',
    max: 'Max',
    apply: 'Apply',
    inStock: 'In stock only',
    onSale: 'On sale only',
    clearAll: 'Clear all',
    count: (n: number) => `${n} ${n === 1 ? 'product' : 'products'}`,
    sort: 'Sort',
    sorts: {
      featured: 'Featured',
      newest: 'Newest',
      'price-asc': 'Price, low to high',
      'price-desc': 'Price, high to low',
    } as Record<ShopSort, string>,
    empty: 'No products match.',
    clearToSee: 'Clear the filters to see everything.',
  },
} as const;

export function shopCopy(locale: 'ar' | 'en') {
  return COPY[locale];
}

/**
 * A facet earns its place only if it can actually split the current results.
 *
 * Against this catalogue in-stock matches 52 of 52 and on-sale 51 of 52. A
 * control that keeps everything is exactly as useless to a shopper as one that
 * keeps nothing, and showing it teaches them the filters do not work — so it
 * is hidden until the data makes it meaningful, and appears on its own.
 *
 * Always shown when already applied, or the shopper could not undo it.
 */
function narrows(matching: number, total: number, applied: boolean | undefined): boolean {
  return Boolean(applied) || (matching > 0 && matching < total);
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-site-line pb-4 last:border-b-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-site-ink-muted">{title}</h3>
      {children}
    </div>
  );
}

function Row({
  href, label, count, active,
}: { href: string; label: string; count?: number; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={[
        'flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm transition-colors',
        active
          ? 'bg-site-accent/12 font-medium text-site-ink'
          : 'text-site-ink-muted hover:bg-site-surface-raised hover:text-site-ink',
      ].join(' ')}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-site-ink-muted">{count}</span>
      )}
    </Link>
  );
}

export function ShopFilterPanel({
  locale, currency, filters, facets,
}: {
  locale: 'ar' | 'en';
  currency: string;
  filters: ShopFilters;
  facets: ShopFacets;
}) {
  const c = COPY[locale];
  const href = (patch: Partial<ShopFilters>) =>
    shopHref(locale, { ...filters, ...patch }, currency);

  // Counted against everything the OTHER filters allow, so the numbers answer
  // "tick this and you get 12" rather than "you already ticked this".
  const universe = Math.max(facets.total, facets.inStock, facets.onSale);

  const showBrands = facets.brands.length > 1 || Boolean(filters.brand);
  const showStock = narrows(facets.inStock, universe, filters.inStock);
  const showSale = narrows(facets.onSale, universe, filters.onSale);
  const showPrice = facets.priceMax > facets.priceMin || filters.minPrice != null || filters.maxPrice != null;

  return (
    <div className="flex flex-col gap-4" data-test-id="shop-filters">
      {facets.categories.length > 0 && (
        <Group title={c.category}>
          <Row href={href({ category: undefined })} label={c.allCategories} active={!filters.category} />
          {facets.categories.map((cat) => (
            <Row
              key={cat.slug}
              href={href({ category: cat.slug })}
              label={cat.name}
              count={cat.count}
              active={filters.category === cat.slug}
            />
          ))}
        </Group>
      )}

      {showBrands && (
        <Group title={c.brand}>
          <Row href={href({ brand: undefined })} label={c.allBrands} active={!filters.brand} />
          {facets.brands.map((b) => (
            <Row
              key={b.slug}
              href={href({ brand: b.slug })}
              label={b.name}
              count={b.count}
              active={filters.brand === b.slug}
            />
          ))}
        </Group>
      )}

      {showPrice && (
        <Group title={c.price}>
          {/* A real GET form: it submits without JavaScript, and the hidden
              fields carry the other filters so applying a price does not
              quietly clear them. */}
          <form method="get" action={shopHref(locale, { category: filters.category }, currency)} className="flex flex-col gap-2">
            {filters.brand && <input type="hidden" name="brand" value={filters.brand} />}
            {filters.inStock && <input type="hidden" name="stock" value="1" />}
            {filters.onSale && <input type="hidden" name="sale" value="1" />}
            {filters.sort && filters.sort !== 'featured' && (
              <input type="hidden" name="sort" value={filters.sort} />
            )}
            <div className="flex items-center gap-2" dir="ltr">
              <label className="sr-only" htmlFor="shop-min">{c.min}</label>
              <input
                id="shop-min" name="min" type="number" inputMode="decimal" min={0}
                placeholder={fromMinor(facets.priceMin, currency)}
                defaultValue={filters.minPrice != null ? fromMinor(filters.minPrice, currency) : ''}
                className="w-full min-w-0 rounded border border-site-line bg-site-surface px-2 py-1.5 text-sm"
                data-test-id="shop-min"
              />
              <span aria-hidden="true" className="text-site-ink-muted">–</span>
              <label className="sr-only" htmlFor="shop-max">{c.max}</label>
              <input
                id="shop-max" name="max" type="number" inputMode="decimal" min={0}
                placeholder={fromMinor(facets.priceMax, currency)}
                defaultValue={filters.maxPrice != null ? fromMinor(filters.maxPrice, currency) : ''}
                className="w-full min-w-0 rounded border border-site-line bg-site-surface px-2 py-1.5 text-sm"
                data-test-id="shop-max"
              />
            </div>
            <button type="submit" className="site-btn-outline w-full justify-center py-1.5 text-sm" data-test-id="shop-price-apply">
              {c.apply}
            </button>
          </form>
        </Group>
      )}

      {(showStock || showSale) && (
        <Group title=" ">
          {showStock && (
            <Row
              href={href({ inStock: filters.inStock ? undefined : true })}
              label={c.inStock}
              count={facets.inStock}
              active={Boolean(filters.inStock)}
            />
          )}
          {showSale && (
            <Row
              href={href({ onSale: filters.onSale ? undefined : true })}
              label={c.onSale}
              count={facets.onSale}
              active={Boolean(filters.onSale)}
            />
          )}
        </Group>
      )}

      {hasActiveFilters(filters) && (
        <Link
          href={shopHref(locale, { sort: filters.sort }, currency)}
          className="site-btn-outline justify-center py-1.5 text-sm"
          data-test-id="shop-clear-all"
        >
          {c.clearAll}
        </Link>
      )}
    </div>
  );
}

/** The applied filters, each removable, above the grid. */
export function ShopChips({
  locale, currency, filters, facets,
}: {
  locale: 'ar' | 'en';
  currency: string;
  filters: ShopFilters;
  facets: ShopFacets;
}) {
  const c = COPY[locale];
  if (!hasActiveFilters(filters)) return null;

  const href = (patch: Partial<ShopFilters>) =>
    shopHref(locale, { ...filters, ...patch }, currency);

  const chips: { key: string; label: string; href: string }[] = [];

  if (filters.category) {
    const name = facets.categories.find((x) => x.slug === filters.category)?.name ?? filters.category;
    chips.push({ key: 'category', label: `${c.category}: ${name}`, href: href({ category: undefined }) });
  }
  if (filters.brand) {
    const name = facets.brands.find((x) => x.slug === filters.brand)?.name ?? filters.brand;
    chips.push({ key: 'brand', label: `${c.brand}: ${name}`, href: href({ brand: undefined }) });
  }
  if (filters.minPrice != null || filters.maxPrice != null) {
    const from = filters.minPrice != null ? formatPrice(filters.minPrice, currency, locale) : '';
    const to = filters.maxPrice != null ? formatPrice(filters.maxPrice, currency, locale) : '';
    chips.push({
      key: 'price',
      label: from && to ? `${from} – ${to}` : from ? `${c.min} ${from}` : `${c.max} ${to}`,
      href: href({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  if (filters.inStock) chips.push({ key: 'stock', label: c.inStock, href: href({ inStock: undefined }) });
  if (filters.onSale) chips.push({ key: 'sale', label: c.onSale, href: href({ onSale: undefined }) });

  return (
    <ul className="flex flex-wrap items-center gap-2" data-test-id="shop-chips">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Link
            href={chip.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-site-line px-3 py-1 text-xs text-site-ink transition-colors hover:bg-site-surface-raised"
            data-test-id={`shop-chip-${chip.key}`}
          >
            {chip.label}
            {/* Decorative: the link's own text already says what it removes. */}
            <span aria-hidden="true" className="text-site-ink-muted">×</span>
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={shopHref(locale, { sort: filters.sort }, currency)}
          className="px-1 text-xs text-site-ink-muted underline underline-offset-2 hover:text-site-ink"
        >
          {c.clearAll}
        </Link>
      </li>
    </ul>
  );
}

/** Sort, as links rather than a select, so it needs no JavaScript either. */
export function ShopSortLinks({
  locale, currency, filters,
}: { locale: 'ar' | 'en'; currency: string; filters: ShopFilters }) {
  const c = COPY[locale];
  const current = filters.sort ?? 'featured';

  return (
    <div className="flex items-center gap-1 overflow-x-auto" data-test-id="shop-sort">
      <span className="shrink-0 pe-1 text-xs uppercase tracking-wide text-site-ink-muted">
        {c.sort}
      </span>
      {(Object.keys(c.sorts) as ShopSort[]).map((s) => (
        <Link
          key={s}
          href={shopHref(locale, { ...filters, sort: s }, currency)}
          aria-current={current === s ? 'true' : undefined}
          data-test-id={`shop-sort-${s}`}
          className={[
            'shrink-0 whitespace-nowrap rounded px-2.5 py-1 text-sm transition-colors',
            current === s
              ? 'bg-site-accent/12 font-medium text-site-ink'
              : 'text-site-ink-muted hover:bg-site-surface-raised hover:text-site-ink',
          ].join(' ')}
        >
          {c.sorts[s]}
        </Link>
      ))}
    </div>
  );
}
