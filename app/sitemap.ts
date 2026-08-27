// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { listPublishedForSitemap } from '@/lib/db/search';
import { locales, env } from '@/lib/env';

/**
 * Every published page, in every locale, with hreflang alternates so search
 * engines treat /ar/x and /en/x as translations rather than duplicates.
 *
 * This file did not exist despite being listed in the implementation docs —
 * an earlier extraction reported it as created and silently produced nothing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  let rows: Awaited<ReturnType<typeof listPublishedForSitemap>> = [];
  try {
    rows = await listPublishedForSitemap();
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

  // The homepage is served at /[locale] and also stored as the 'home' slug —
  // listing both would be a duplicate.
  return [...roots, ...pages.filter((p) => !p.url.endsWith('/home'))];
}
