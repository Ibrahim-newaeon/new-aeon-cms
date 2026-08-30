// lib/db/search.ts
import { db } from './index';
import { content, contentI18n, products, productI18n, productImages } from './schema';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';

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

export interface ProductHit {
  slug: string;
  name: string;
  excerpt: string | null;
  price: number;
  imageUrl: string | null;
}

/**
 * Products matching a query.
 *
 * Separate from searchContent rather than a union: they live in different
 * tables, they link to different routes, and a shopper looking for a product
 * is not helped by ranking it against a blog post. The page renders them as
 * their own group.
 *
 * Callers must check commerceEnabled() first — this function does not, so that
 * it stays a plain query and the guard stays in one place.
 */
export async function searchProducts(
  rawQuery: string,
  locale: 'ar' | 'en',
  limit = 30
): Promise<ProductHit[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const needle = `%${escapeLike(query)}%`;

  return db
    .select({
      slug: products.slug,
      name: productI18n.name,
      excerpt: productI18n.shortDesc,
      price: products.basePrice,
      // The first image only. Joining the table would multiply a product by its
      // image count and return the same product five times.
      imageUrl: sql<string | null>`(
        select ${productImages.url} from ${productImages}
        where ${productImages.productId} = ${products.id}
        order by ${productImages.sortOrder} asc nulls last
        limit 1
      )`,
    })
    .from(products)
    .innerJoin(
      productI18n,
      and(eq(products.id, productI18n.productId), eq(productI18n.locale, locale))
    )
    .where(
      and(
        eq(products.isActive, true),
        or(
          ilike(productI18n.name, needle),
          ilike(productI18n.shortDesc, needle),
          // The slug carries the SKU in imported catalogues, so this is how
          // "JM-PKG-01" finds anything.
          ilike(products.slug, needle)
        )
      )
    )
    .orderBy(asc(products.sortOrder), asc(productI18n.name))
    .limit(limit);
}

/**
 * Active products for the sitemap.
 *
 * Without this the storefront's entire catalogue was absent from the sitemap —
 * 52 pages a crawler could only reach by following links from /shop.
 */
export async function listProductsForSitemap() {
  return db
    .select({
      slug: products.slug,
      updatedAt: sql<Date>`coalesce(${products.updatedAt}, ${products.createdAt})`,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(desc(products.createdAt));
}
