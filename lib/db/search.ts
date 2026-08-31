// lib/db/search.ts
import { db } from './index';
import { content, contentI18n, products, productI18n, productImages } from './schema';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { isBilingual } from '../commerce/live';

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
      name: sql<string>`coalesce(
        ${productI18n.name},
        (select i.name from product_i18n i where i.product_id = ${products.id} order by i.locale limit 1),
        ${products.slug}
      )`,
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
    .leftJoin(
      productI18n,
      and(eq(products.id, productI18n.productId), eq(productI18n.locale, locale))
    )
    .where(
      and(
        eq(products.isActive, true),
        isBilingual,
        or(
          // Matches ANY locale's text: an English speaker searching for a
          // product by its Arabic name should still find it. Safe now that
          // isBilingual guarantees the result has an English name to show.
          sql`exists (
            select 1 from ${productI18n} i
            where i.product_id = ${products.id}
              and (i.name ilike ${needle} or i.short_description ilike ${needle})
          )`,
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
 * Without this the storefront's entire catalogue was absent — 52 pages a
 * crawler could only reach by following links from /shop.
 *
 * Every locale again. This briefly returned a per-locale set, because
 * getShopProduct INNER JOINed product_i18n and a product with no English name
 * 404'd on /en. Products now fall back to another locale's name rather than
 * disappearing, so every active product resolves under every locale and the
 * narrowing is no longer needed — the fix moved to where the bug actually was.
 */
export async function listProductsForSitemap() {
  return db
    .select({
      slug: products.slug,
      updatedAt: sql<Date>`coalesce(${products.updatedAt}, ${products.createdAt})`,
    })
    .from(products)
    // The sitemap must not advertise a URL that 404s in one of the two
    // languages it lists as alternates.
    .where(and(eq(products.isActive, true), isBilingual))
    .orderBy(desc(products.createdAt));
}
