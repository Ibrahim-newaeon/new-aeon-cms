// lib/seo/json-ld.ts
import { env } from '@/lib/env';
import { minorUnitExponent, toMajorUnits } from '@/lib/money';

/**
 * Structured data for search engines.
 *
 * The storefront had none, so a catalogue of real products appeared in results
 * as a plain blue link: no price, no availability, no star rating, even though
 * all three are on the page and in the database. Schema.org is how those become
 * a rich result.
 *
 * Everything here builds a plain object. Rendering is the JsonLd component's
 * job, and it is the one place the escaping happens.
 */

/** Schema.org requires absolute URLs; a relative one is silently ignored. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * A price for a machine, not a reader.
 *
 * `formatPrice` is for the page — on an Arabic locale it emits Arabic-Indic
 * digits and a currency symbol ("١٢٩٫٠٠٠ د.أ"), which is correct on screen and
 * unparseable as schema.org `price`. This is always a plain decimal.
 */
export function priceString(minor: number, currency: string): string {
  return toMajorUnits(minor, currency).toFixed(minorUnitExponent(currency));
}

const AVAILABILITY = {
  in: 'https://schema.org/InStock',
  out: 'https://schema.org/OutOfStock',
} as const;

interface OfferSource {
  price: number;
  stock: number | null;
}

interface ProductInput {
  slug: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  images: string[];
  basePrice: number;
  currency: string;
  locale: 'ar' | 'en';
  inStock: boolean;
  /** Active variants. Empty for a product sold as a single item. */
  variants: OfferSource[];
  rating?: { average: number; count: number } | null;
}

/**
 * One offer when there is one price, an AggregateOffer when variants differ.
 *
 * Emitting a single price for a product whose variants run 35–120 JOD would put
 * a number in the search result that the page then contradicts, which is the
 * specific thing Google penalises.
 */
function buildOffers(input: ProductInput) {
  const url = absoluteUrl(`/${input.locale}/products/${input.slug}`);
  const prices = input.variants.map((v) => v.price);
  const distinct = new Set(prices);

  if (prices.length === 0 || distinct.size <= 1) {
    const price = prices[0] ?? input.basePrice;
    return {
      '@type': 'Offer',
      url,
      priceCurrency: input.currency,
      price: priceString(price, input.currency),
      availability: input.inStock ? AVAILABILITY.in : AVAILABILITY.out,
    };
  }

  return {
    '@type': 'AggregateOffer',
    url,
    priceCurrency: input.currency,
    lowPrice: priceString(Math.min(...prices), input.currency),
    highPrice: priceString(Math.max(...prices), input.currency),
    offerCount: prices.length,
    availability: input.inStock ? AVAILABILITY.in : AVAILABILITY.out,
  };
}

export function productJsonLd(input: ProductInput): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    url: absoluteUrl(`/${input.locale}/products/${input.slug}`),
    offers: buildOffers(input),
  };

  if (input.description) node.description = input.description;
  if (input.sku) node.sku = input.sku;
  if (input.images.length > 0) node.image = input.images.map(absoluteUrl);

  // Omitted entirely when there are no reviews. `ratingCount: 0` is not "no
  // rating" to a validator, it is an invalid rating, and it invalidates the
  // whole Product node rather than just the one field.
  if (input.rating && input.rating.count > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.rating.average.toFixed(1),
      reviewCount: input.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return node;
}

/** Trail for the breadcrumb line search engines show under the title. */
export function breadcrumbJsonLd(
  trail: { name: string; path: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: absoluteUrl(step.path),
    })),
  };
}

/**
 * Who this shop is, as a machine-readable fact.
 *
 * This is the node an answer engine reads to decide that a name, a website, a
 * logo and half a dozen social profiles are ONE organisation rather than
 * unrelated pages. `sameAs` is what does that work — it is the reason the
 * social links in Settings are worth filling in.
 */
export function organizationJsonLd(input: {
  name: string;
  description?: string | null;
  logo?: string | null;
  sameAs?: string[];
  email?: string | null;
  phone?: string | null;
  /** Where the shop is. A local business without a country is a weak entity. */
  country?: string | null;
}): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: absoluteUrl('/'),
  };

  if (input.description) node.description = input.description;
  if (input.logo) node.logo = absoluteUrl(input.logo);

  // Omitted when empty rather than emitted as []: an empty sameAs says nothing
  // and reads to a validator as a claim of no profiles.
  if (input.sameAs && input.sameAs.length > 0) node.sameAs = input.sameAs;

  if (input.email || input.phone) {
    node.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { telephone: input.phone } : {}),
      ...(input.country ? { areaServed: input.country } : {}),
    };
  }

  if (input.country) node.address = { '@type': 'PostalAddress', addressCountry: input.country };

  return node;
}

/** The site itself, and how to search it. */
export function webSiteJsonLd(input: {
  name: string;
  description?: string | null;
  locales: readonly string[];
  /** Omit to leave out the search action entirely. */
  searchPath?: string;
}): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name,
    url: absoluteUrl('/'),
    inLanguage: [...input.locales],
  };

  if (input.description) node.description = input.description;

  if (input.searchPath) {
    node.potentialAction = {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absoluteUrl(input.searchPath)}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    };
  }

  return node;
}

/**
 * Questions and answers, as a machine can read them.
 *
 * Answers are plain text on purpose. FAQPage wants a string, and the exercise
 * of writing one or two sentences is the same exercise that makes a good
 * answer for a person — which is why the block that feeds this holds text
 * rather than a nested block tree.
 */
export function faqJsonLd(
  items: { question: string; answer: string }[]
): Record<string, unknown> | null {
  const usable = items.filter((i) => i.question.trim() && i.answer.trim());
  // No node at all beats an empty mainEntity, which is invalid.
  if (usable.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: usable.map((i) => ({
      '@type': 'Question',
      name: i.question.trim(),
      acceptedAnswer: { '@type': 'Answer', text: i.answer.trim() },
    })),
  };
}
