// lib/commerce/shop-query.ts
import { minorUnitExponent } from '@/lib/money';
import { SHOP_SORTS, type ShopFilters, type ShopSort } from './storefront';

/**
 * The filter bar's state lives in the URL, not in React.
 *
 * Every control is a link to the same page with one parameter changed. That
 * buys the back button, sharing, and a working page without JavaScript for
 * free, and it is why there is no spinner on a checkbox: the grid is a server
 * render, and Next swaps it in as a soft navigation.
 *
 * Prices are MAJOR units in the URL — `?min=30&max=200` is something a person
 * can read and edit — and minor units everywhere behind it.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/** `?min=30` -> 30000 fils. Rejects anything that is not a plain number. */
function toMinor(raw: string | undefined, currency: string): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const [whole = '0', frac = ''] = trimmed.split('.');
  const exponent = minorUnitExponent(currency);
  const padded = (frac + '0'.repeat(exponent)).slice(0, exponent);
  const value = Number(whole + padded);
  return Number.isSafeInteger(value) ? value : undefined;
}

export function fromMinor(amount: number, currency: string): string {
  const exponent = minorUnitExponent(currency);
  if (exponent === 0) return String(amount);
  const s = String(Math.round(amount)).padStart(exponent + 1, '0');
  const whole = s.slice(0, -exponent);
  const frac = s.slice(-exponent).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Reads the URL into filters.
 *
 * Anything unrecognised is DROPPED rather than passed through. These values
 * reach a SQL builder, and a slug that is not a slug has no business getting
 * that far — a bad `?sort=` should give the default order, not an error page.
 */
export function parseShopParams(
  params: SearchParams,
  currency = 'JOD',
  categoryFromPath?: string
): ShopFilters {
  const category = categoryFromPath ?? one(params.category);
  const brand = one(params.brand);
  const sort = one(params.sort);

  const min = toMinor(one(params.min), currency);
  const max = toMinor(one(params.max), currency);

  return {
    category: category && SLUG.test(category) ? category : undefined,
    brand: brand && SLUG.test(brand) ? brand : undefined,
    // Swapped bounds are a typo, not a request for nothing. Ordering them
    // returns the range the person plainly meant.
    minPrice: min != null && max != null ? Math.min(min, max) : min,
    maxPrice: min != null && max != null ? Math.max(min, max) : max,
    inStock: one(params.stock) === '1' || undefined,
    onSale: one(params.sale) === '1' || undefined,
    sort: SHOP_SORTS.includes(sort as ShopSort) ? (sort as ShopSort) : undefined,
  };
}

/**
 * Filters back into a URL.
 *
 * Category is a PATH, not a query parameter: /shop/perfumes already exists as
 * an indexable page, and letting the bar also write ?category= would put the
 * same 25 products at two addresses and manufacture a duplicate-content
 * problem. Everything else is a parameter.
 */
export function shopHref(locale: string, filters: ShopFilters, currency = 'JOD'): string {
  const path = filters.category
    ? `/${locale}/shop/${filters.category}`
    : `/${locale}/shop`;

  const q = new URLSearchParams();
  if (filters.brand) q.set('brand', filters.brand);
  if (filters.minPrice != null) q.set('min', fromMinor(filters.minPrice, currency));
  if (filters.maxPrice != null) q.set('max', fromMinor(filters.maxPrice, currency));
  if (filters.inStock) q.set('stock', '1');
  if (filters.onSale) q.set('sale', '1');
  // 'featured' is the default and stays out of the URL, so the plain /shop
  // address is the canonical one rather than one of four spellings.
  if (filters.sort && filters.sort !== 'featured') q.set('sort', filters.sort);

  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** True when anything is narrowing the grid — drives the "Clear all" control. */
export function hasActiveFilters(filters: ShopFilters): boolean {
  return Boolean(
    filters.category ||
      filters.brand ||
      filters.minPrice != null ||
      filters.maxPrice != null ||
      filters.inStock ||
      filters.onSale
  );
}
