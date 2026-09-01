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
 * Rendered per request, never baked at build time.
 *
 * Two separate reasons, and they point the same way.
 *
 * Correctness: Next prerenders sitemap.ts as a STATIC file by default, so the
 * catalogue it lists would be whatever the database held during `next build`.
 * Publishing a product would leave it missing from the sitemap until the next
 * deploy — silent, with the symptom "Google never indexed the new range".
 *
 * Portability: `revalidate` alone does not fix that, because a route with only
 * a revalidate window is STILL rendered once at build, which means the build
 * needs a reachable database. That is false everywhere the database is not the
 * developer's own — the Docker build has a placeholder DATABASE_URL, and the
 * first Railway deploy died on the sibling /llms.txt with ENOTFOUND
 * postgres.railway.internal. This route queries products the same way.
 *
 * The cost is two queries per request, on a file crawlers fetch a handful of
 * times a day. The gain is that the image builds anywhere, with no
 * infrastructure, which is what makes CI and a cold deploy possible at all.
 */
export const dynamic = 'force-dynamic';

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
