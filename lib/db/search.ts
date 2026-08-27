// lib/db/search.ts
import { db } from './index';
import { content, contentI18n } from './schema';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

export interface SearchHit {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
}

/**
 * `%` and `_` are wildcards inside LIKE. Without escaping them, a query of "%"
 * matches every row and "a_c" matches "abc" — surprising rather than dangerous,
 * but wrong. Drizzle parameterises the value, so this is about correctness,
 * not injection.
 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function searchContent(
  rawQuery: string,
  locale: 'ar' | 'en',
  limit = 30
): Promise<SearchHit[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const needle = `%${escapeLike(query)}%`;

  const rows = await db
    .select({
      slug: content.slug,
      title: contentI18n.title,
      excerpt: contentI18n.excerpt,
      publishedAt: content.publishedAt,
    })
    .from(content)
    .innerJoin(
      contentI18n,
      and(eq(content.id, contentI18n.contentId), eq(contentI18n.locale, locale))
    )
    .where(
      and(
        eq(content.status, 'published'),
        or(
          ilike(contentI18n.title, needle),
          ilike(contentI18n.excerpt, needle),
          ilike(content.slug, needle)
        )
      )
    )
    .orderBy(desc(content.publishedAt))
    .limit(limit);

  return rows;
}

/**
 * Published content for the sitemap, newest first.
 * `updatedAt` drives <lastmod>, falling back to publishedAt.
 */
export async function listPublishedForSitemap() {
  return db
    .select({
      slug: content.slug,
      updatedAt: sql<Date>`coalesce(${content.updatedAt}, ${content.publishedAt})`,
    })
    .from(content)
    .where(eq(content.status, 'published'))
    .orderBy(desc(content.publishedAt));
}
