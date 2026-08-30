// lib/seo/metadata.ts
import type { Metadata } from 'next';
import { env, locales, type Locale } from '@/lib/env';
import { absoluteUrl } from './json-ld';

/**
 * The head tags every page needs and none of them had.
 *
 * A rendered page carried a title and a description and nothing else: no
 * canonical, no Open Graph beyond an image when one happened to be set, and no
 * hreflang. The consequences are concrete rather than theoretical —
 *
 *   - This site serves /ar and /en of everything, plus filtered shop URLs like
 *     ?sale=1&sort=price-asc. With no canonical, nothing tells a search engine
 *     which of those is the page and which are views of it.
 *   - A link pasted into WhatsApp — how this shop's customers actually share
 *     things — rendered as a bare URL, because og:title and og:description
 *     were never emitted.
 *
 * Declared here so a new page gets all of it by calling one function, rather
 * than by remembering nine fields.
 */

export interface PageMetaInput {
  locale: Locale;
  /** Path WITHOUT the locale prefix: '/shop', '/products/amber-oud', or ''. */
  path: string;
  title: string;
  description?: string | null;
  /** Absolute or site-relative. Falls back to the site's own social image. */
  image?: string | null;
  /** 'article' for content, 'website' otherwise. Products use 'website'. */
  type?: 'website' | 'article';
  noIndex?: boolean;
  siteName?: string | null;
  /**
   * Query string to keep on the canonical, e.g. a category page. Filter
   * parameters are deliberately NOT canonical: /shop?sale=1 is a view of
   * /shop, not a separate page, and letting each combination self-canonicalise
   * invites a search engine to index the whole matrix.
   */
  canonicalQuery?: string;
}

const OG_LOCALE: Record<Locale, string> = { ar: 'ar_JO', en: 'en_GB' };

export function buildMetadata(input: PageMetaInput): Metadata {
  const path = input.path.startsWith('/') || input.path === '' ? input.path : `/${input.path}`;
  const canonicalPath = `/${input.locale}${path}${input.canonicalQuery ?? ''}`;

  // Every locale of this page, so a search engine treats them as translations
  // rather than duplicates. x-default points at the site's own default.
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = absoluteUrl(`/${l}${path}`);
  languages['x-default'] = absoluteUrl(`/${env.DEFAULT_LOCALE}${path}`);

  const description = input.description?.trim() || undefined;
  const image = input.image ? absoluteUrl(input.image) : undefined;

  return {
    title: input.title,
    description,
    alternates: {
      canonical: absoluteUrl(canonicalPath),
      languages,
    },
    openGraph: {
      type: input.type ?? 'website',
      title: input.title,
      description,
      url: absoluteUrl(canonicalPath),
      siteName: input.siteName ?? undefined,
      locale: OG_LOCALE[input.locale],
      // The other locale, so a share on a bilingual site says so.
      alternateLocale: locales.filter((l) => l !== input.locale).map((l) => OG_LOCALE[l]),
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      // summary_large_image only when there IS an image; the large card with
      // no picture renders worse than the small one.
      card: image ? 'summary_large_image' : 'summary',
      title: input.title,
      description,
      images: image ? [image] : undefined,
    },
    robots: input.noIndex ? { index: false, follow: false } : undefined,
  };
}
