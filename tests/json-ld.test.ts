// tests/json-ld.test.ts
import { describe, it, expect } from 'vitest';
import { productJsonLd, breadcrumbJsonLd, priceString, absoluteUrl } from '@/lib/seo/json-ld';

const base = {
  slug: 'amber-oud',
  name: 'Amber Oud',
  images: ['/uploads/2026/08/a.webp'],
  basePrice: 129000,
  currency: 'JOD',
  locale: 'en' as const,
  inStock: true,
  variants: [],
};

describe('priceString', () => {
  it('emits a plain decimal, not a localised one', () => {
    // formatPrice on an Arabic locale returns Arabic-Indic digits and a
    // currency symbol. Schema.org `price` must parse as a number.
    expect(priceString(129000, 'JOD')).toBe('129.000');
    expect(priceString(12900, 'USD')).toBe('129.00');
    expect(priceString(129, 'JPY')).toBe('129');
  });
});

describe('absoluteUrl', () => {
  it('leaves an absolute URL alone and makes a path absolute', () => {
    // A relative URL in structured data is silently ignored by crawlers.
    expect(absoluteUrl('https://cdn.example/a.webp')).toBe('https://cdn.example/a.webp');
    expect(absoluteUrl('/en/products/x')).toMatch(/^https?:\/\/.+\/en\/products\/x$/);
  });
});

describe('productJsonLd', () => {
  it('uses a single Offer when every variant costs the same', () => {
    const node = productJsonLd({ ...base, variants: [{ price: 129000, stock: 3 }] });
    expect((node.offers as Record<string, unknown>)['@type']).toBe('Offer');
    expect((node.offers as Record<string, unknown>).price).toBe('129.000');
  });

  it('uses an AggregateOffer when variants differ in price', () => {
    // One price on a product whose variants run 35-120 would put a number in
    // the search result that the page itself contradicts.
    const node = productJsonLd({
      ...base,
      variants: [{ price: 35000, stock: 1 }, { price: 120000, stock: 2 }],
    });
    const offers = node.offers as Record<string, unknown>;
    expect(offers['@type']).toBe('AggregateOffer');
    expect(offers.lowPrice).toBe('35.000');
    expect(offers.highPrice).toBe('120.000');
    expect(offers.offerCount).toBe(2);
  });

  it('falls back to the base price when a product has no variants', () => {
    expect((productJsonLd(base).offers as Record<string, unknown>).price).toBe('129.000');
  });

  it('marks availability from the page’s own in-stock flag', () => {
    expect((productJsonLd({ ...base, inStock: false }).offers as Record<string, unknown>).availability)
      .toBe('https://schema.org/OutOfStock');
  });

  it('omits aggregateRating entirely when there are no reviews', () => {
    // ratingCount: 0 is not "no rating" to a validator, it is an invalid one,
    // and it invalidates the whole Product node.
    expect(productJsonLd({ ...base, rating: { average: 0, count: 0 } }).aggregateRating).toBeUndefined();
    expect(productJsonLd(base).aggregateRating).toBeUndefined();
  });

  it('includes aggregateRating once a product has reviews', () => {
    const node = productJsonLd({ ...base, rating: { average: 4.5, count: 12 } });
    expect(node.aggregateRating).toMatchObject({ ratingValue: '4.5', reviewCount: 12 });
  });

  it('makes image URLs absolute', () => {
    expect((productJsonLd(base).image as string[])[0]).toMatch(/^https?:\/\/.+\/uploads\//);
  });

  it('escapes a closing script tag rather than letting it break out', () => {
    // Product names are editor input, and in an imported catalogue they are
    // someone else's export. JSON.stringify does not escape `<`, and the HTML
    // parser ends the script at the first `</script` whatever the JSON says.
    const node = productJsonLd({ ...base, name: 'Oud </script><script>alert(1)</script>' });
    const rendered = JSON.stringify(node).replace(/</g, '\\u003c');
    expect(rendered).not.toContain('</script');
    expect(JSON.parse(rendered).name).toBe('Oud </script><script>alert(1)</script>');
  });
});

describe('breadcrumbJsonLd', () => {
  it('numbers positions from one and absolutises each item', () => {
    const node = breadcrumbJsonLd([
      { name: 'Shop', path: '/en/shop' },
      { name: 'Amber Oud', path: '/en/products/amber-oud' },
    ]);
    const items = node.itemListElement as Record<string, unknown>[];
    expect(items.map((i) => i.position)).toEqual([1, 2]);
    expect(items[0]!.item).toMatch(/^https?:\/\/.+\/en\/shop$/);
  });
});
