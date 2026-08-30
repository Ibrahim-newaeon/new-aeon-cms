// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { listPublishedForSitemap, listProductsForSitemap } from '@/lib/db/search';
import { commerceEnabled } from '@/lib/commerce/guard';
import { locales, env } from '@/lib/env';

/**
 * Every published page, in every locale, with hreflang alternates so search
 * engines treat /ar/x and /en/x as translations rather than duplicates.
 *
 * This file did not exist despite being listed in the implementation docs —
 * an earlier extraction reported it as created and silently produced nothing.
 */
/**
 * Regenerated hourly rather than baked at build time.
 *
 * Next prerenders sitemap.ts as a STATIC file by default, so the catalogue it
 * lists is whatever the database held during `next build`. Publishing a product
 * would then leave it missing from the sitemap until the next deploy — the
 * failure is silent, and the symptom is "Google never indexed the new range".
 *
 * An hour, not force-dynamic: this runs two queries, and serving them fresh on
 * every crawler hit buys nothing a crawler can perceive.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  let rows: Awaited<ReturnType<typeof listPublishedForSitemap>> = [];
  let productRows: Awaited<ReturnType<typeof listProductsForSitemap>> = [];
  try {
    rows = await listPublishedForSitemap();
    // Gated on the module being on. Listing product URLs while commerce is
    // disabled advertises pages that notFound() — a sitemap full of 404s is
    // worse for a domain than one that never mentioned them.
    if (await commerceEnabled()) productRows = await listProductsForSitemap();
  } catch (error) {
    // A sitemap that 500s is worse than a sparse one: crawlers back off on
    // repeated errors. Degrade to the locale roots instead.
    console.error('Sitemap query failed:', error);
  }

  const languages = (slug: string) =>
    Object.fromEntries(locales.map((l) => [l, `${base}/${l}${slug}`]));

  const roots: MetadataRoute.Sitemap = locales.map((locale) => ({
    url: `${base}/${locale}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 1,
    alternates: { languages: languages('') },
  }));

  const pages: MetadataRoute.Sitemap = rows.flatMap((row) =>
    locales.map((locale) => ({
      url: `${base}/${locale}/${row.slug}`,
      lastModified: row.updatedAt ? new Date(row.updatedAt) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      alternates: { languages: languages(`/${row.slug}`) },
    }))
  );

  const shopRoots: MetadataRoute.Sitemap = productRows.length
    ? locales.map((locale) => ({
        url: `${base}/${locale}/shop`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.9,
        alternates: { languages: languages('/shop') },
      }))
    : [];

  const productPages: MetadataRoute.Sitemap = productRows.flatMap((row) =>
    locales.map((locale) => ({
      url: `${base}/${locale}/products/${row.slug}`,
      lastModified: row.updatedAt ? new Date(row.updatedAt) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      alternates: { languages: languages(`/products/${row.slug}`) },
    }))
  );

  // The homepage is served at /[locale] and also stored as the 'home' slug —
  // listing both would be a duplicate.
  return [
    ...roots,
    ...pages.filter((p) => !p.url.endsWith('/home')),
    ...shopRoots,
    ...productPages,
  ];
}
