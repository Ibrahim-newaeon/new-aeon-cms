// tests/shop-query.test.ts
import { describe, it, expect } from 'vitest';
import { parseShopParams, shopHref, hasActiveFilters, fromMinor } from '@/lib/commerce/shop-query';

describe('parseShopParams', () => {
  it('reads prices as major units and stores them as minor', () => {
    const f = parseShopParams({ min: '30', max: '219.5' }, 'JOD');
    expect(f.minPrice).toBe(30000);
    expect(f.maxPrice).toBe(219500);
  });

  it('respects the currency exponent', () => {
    expect(parseShopParams({ min: '30' }, 'USD').minPrice).toBe(3000);
    expect(parseShopParams({ min: '30' }, 'JPY').minPrice).toBe(30);
  });

  it('orders swapped bounds instead of returning nothing', () => {
    // ?min=200&max=30 is a typo, not a request for an empty grid.
    const f = parseShopParams({ min: '200', max: '30' }, 'JOD');
    expect([f.minPrice, f.maxPrice]).toEqual([30000, 200000]);
  });

  it('drops values that are not what they claim to be', () => {
    // These reach a SQL builder; a slug that is not a slug stops here.
    const f = parseShopParams(
      { category: "'; drop table products--", brand: 'Not A Slug', sort: 'sideways', min: 'cheap' },
      'JOD'
    );
    expect(f.category).toBeUndefined();
    expect(f.brand).toBeUndefined();
    expect(f.sort).toBeUndefined();
    expect(f.minPrice).toBeUndefined();
  });

  it('takes the category from the path when there is one', () => {
    // /shop/perfumes wins: the path is the canonical form.
    expect(parseShopParams({ category: 'women' }, 'JOD', 'perfumes').category).toBe('perfumes');
  });

  it('reads the toggles only when explicitly on', () => {
    expect(parseShopParams({ stock: '1', sale: '1' }).inStock).toBe(true);
    expect(parseShopParams({ stock: '0' }).inStock).toBeUndefined();
    expect(parseShopParams({}).onSale).toBeUndefined();
  });

  it('takes the first value when a parameter is repeated', () => {
    expect(parseShopParams({ sort: ['newest', 'price-asc'] }).sort).toBe('newest');
  });
});

describe('shopHref', () => {
  it('puts the category in the path, never in the query', () => {
    // /shop/perfumes is already an indexable page; ?category= would give the
    // same products a second address.
    expect(shopHref('ar', { category: 'perfumes' })).toBe('/ar/shop/perfumes');
    expect(shopHref('ar', {})).toBe('/ar/shop');
  });

  it('leaves the default sort out so /shop stays the canonical URL', () => {
    expect(shopHref('en', { sort: 'featured' })).toBe('/en/shop');
    expect(shopHref('en', { sort: 'price-asc' })).toBe('/en/shop?sort=price-asc');
  });

  it('writes prices back as major units', () => {
    expect(shopHref('en', { minPrice: 30000, maxPrice: 219000 }, 'JOD')).toBe(
      '/en/shop?min=30&max=219'
    );
  });

  it('round-trips through the parser', () => {
    const original = {
      category: 'perfumes', brand: 'aeon-atelier',
      minPrice: 30000, maxPrice: 219000,
      inStock: true, onSale: true, sort: 'price-desc' as const,
    };
    const url = shopHref('ar', original, 'JOD');
    const back = parseShopParams(
      Object.fromEntries(new URL(url, 'https://x.test').searchParams),
      'JOD',
      'perfumes'
    );
    expect(back).toEqual(original);
  });
});

describe('fromMinor', () => {
  it('trims trailing zeros so a URL reads as a price a person would type', () => {
    expect(fromMinor(30000, 'JOD')).toBe('30');
    expect(fromMinor(219500, 'JOD')).toBe('219.5');
    expect(fromMinor(129, 'JPY')).toBe('129');
  });
});

describe('hasActiveFilters', () => {
  it('ignores sort, which never narrows anything', () => {
    // "Clear all" must not appear just because someone changed the order.
    expect(hasActiveFilters({ sort: 'newest' })).toBe(false);
    expect(hasActiveFilters({ onSale: true })).toBe(true);
    expect(hasActiveFilters({})).toBe(false);
  });
});
