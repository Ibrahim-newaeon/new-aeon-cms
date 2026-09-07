// lib/site/chrome.ts
//
// Decides whether the storefront shell (announcement, nav, WhatsApp, footer)
// should render for the current URL. Blank chrome is opt-in via an html block
// with fullPage: true — used when pasting a legacy full-page layout.

import { cache } from 'react';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes } from '@/lib/db/schema';
import { asContentBlocks } from '@/lib/blocks/content-schema';
import { blocksRequestBlankChrome } from '@/lib/blocks/html-paste';
import { locales, type Locale } from '@/lib/env';

/** Route segments that are never blank-chrome content pages. */
const RESERVED = new Set([
  'shop',
  'products',
  'cart',
  'checkout',
  'account',
  'order',
  'search',
  'blog',
  'resources',
  'category',
  'tag',
  'bundles',
  'coming-soon',
  'setup',
  'api',
]);

export type ChromeMode = 'default' | 'none';

/**
 * Parse /{locale} or /{locale}/{slug}… and load published body blocks to see
 * if any html block requested a blank shell.
 */
export const resolveChromeMode = cache(async (pathname: string): Promise<ChromeMode> => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return 'default';

  const localePart = parts[0];
  if (!localePart || !locales.includes(localePart as Locale)) return 'default';
  const locale = localePart as Locale;

  // Home: /ar or /en
  if (parts.length === 1) {
    return chromeForSlug('home', locale);
  }

  const segment = parts[1];
  if (!segment || RESERVED.has(segment)) return 'default';

  // /ar/about — page slug
  if (parts.length === 2) {
    return chromeForSlug(segment, locale);
  }

  // /ar/case-studies/acme — custom type entry
  if (parts.length === 3) {
    const slug = parts[2];
    if (!slug) return 'default';
    return chromeForTypeEntry(segment, slug, locale);
  }

  return 'default';
});

async function chromeForSlug(slug: string, locale: Locale): Promise<ChromeMode> {
  const [row] = await db
    .select({
      status: content.status,
      body: contentI18n.body,
    })
    .from(content)
    .leftJoin(
      contentI18n,
      and(eq(contentI18n.contentId, content.id), eq(contentI18n.locale, locale))
    )
    .where(eq(content.slug, slug))
    .limit(1);

  if (!row || row.status !== 'published') return 'default';
  return blocksRequestBlankChrome(asContentBlocks(row.body)) ? 'none' : 'default';
}

async function chromeForTypeEntry(
  prefix: string,
  slug: string,
  locale: Locale
): Promise<ChromeMode> {
  const [row] = await db
    .select({
      status: content.status,
      body: contentI18n.body,
    })
    .from(content)
    .innerJoin(contentTypes, eq(contentTypes.id, content.typeId))
    .leftJoin(
      contentI18n,
      and(eq(contentI18n.contentId, content.id), eq(contentI18n.locale, locale))
    )
    .where(and(eq(content.slug, slug), eq(contentTypes.routePrefix, prefix)))
    .limit(1);

  if (!row || row.status !== 'published') return 'default';
  return blocksRequestBlankChrome(asContentBlocks(row.body)) ? 'none' : 'default';
}
