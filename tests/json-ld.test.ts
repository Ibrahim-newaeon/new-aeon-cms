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

import { organizationJsonLd, webSiteJsonLd, faqJsonLd } from '@/lib/seo/json-ld';

describe('organizationJsonLd', () => {
  it('omits sameAs when there are no profiles', () => {
    // An empty array is a claim of no profiles, not an absence of information.
    expect(organizationJsonLd({ name: 'New Aeon', sameAs: [] }).sameAs).toBeUndefined();
  });

  it('carries the profiles that tie a name to one entity', () => {
    const node = organizationJsonLd({
      name: 'New Aeon',
      sameAs: ['https://instagram.com/x', 'https://facebook.com/x'],
    });
    expect(node.sameAs).toHaveLength(2);
  });

  it('builds a contact point only when there is something to contact', () => {
    expect(organizationJsonLd({ name: 'X' }).contactPoint).toBeUndefined();
    expect(organizationJsonLd({ name: 'X', phone: '+962790000000' }).contactPoint)
      .toMatchObject({ telephone: '+962790000000' });
  });

  it('invents nothing when settings are empty', () => {
    // A confident description nobody wrote is worse than a missing one.
    const node = organizationJsonLd({ name: 'X' });
    expect(node.description).toBeUndefined();
    expect(node.logo).toBeUndefined();
    expect(node).toMatchObject({ '@type': 'Organization', name: 'X' });
  });
});

describe('webSiteJsonLd', () => {
  it('declares every language the site serves', () => {
    expect(webSiteJsonLd({ name: 'X', locales: ['ar', 'en'] }).inLanguage).toEqual(['ar', 'en']);
  });

  it('adds a search action only when there is a search page', () => {
    expect(webSiteJsonLd({ name: 'X', locales: ['ar'] }).potentialAction).toBeUndefined();
    const withSearch = webSiteJsonLd({ name: 'X', locales: ['ar'], searchPath: '/ar/search' });
    expect(JSON.stringify(withSearch.potentialAction)).toContain('{search_term_string}');
  });
});

describe('faqJsonLd', () => {
  it('pairs each question with its answer', () => {
    const node = faqJsonLd([{ question: 'Do you deliver to Irbid?', answer: 'Yes, in 2–3 days.' }])!;
    expect(node['@type']).toBe('FAQPage');
    const first = (node.mainEntity as Record<string, unknown>[])[0]!;
    expect(first.name).toBe('Do you deliver to Irbid?');
    expect((first.acceptedAnswer as Record<string, string>).text).toBe('Yes, in 2–3 days.');
  });

  it('returns null rather than an empty FAQPage', () => {
    // mainEntity: [] is invalid, and an empty node invalidates the page.
    expect(faqJsonLd([])).toBeNull();
    expect(faqJsonLd([{ question: '  ', answer: '  ' }])).toBeNull();
  });

  it('drops a half-filled row instead of publishing a blank answer', () => {
    const node = faqJsonLd([
      { question: 'Real question?', answer: 'Real answer.' },
      { question: 'Unfinished?', answer: '' },
    ])!;
    expect(node.mainEntity).toHaveLength(1);
  });
});
