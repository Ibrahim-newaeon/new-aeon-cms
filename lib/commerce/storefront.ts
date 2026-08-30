// lib/commerce/storefront.ts
import { db } from '@/lib/db';
import {
  products, productI18n, productImages, productVariants,
  productOptions, variantOptionValues, productSpecs, categories, categoryI18n,
  productCategories, brands,
} from '@/lib/db/schema';
import { and, asc, desc, eq, gte, lte, inArray, sql, type SQL } from 'drizzle-orm';

export interface ShopCard {
  slug: string;
  name: string;
  shortDesc: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  image: { url: string; alt: string | null } | null;
}

export type ShopSort = 'featured' | 'newest' | 'price-asc' | 'price-desc';

export const SHOP_SORTS: readonly ShopSort[] = ['featured', 'newest', 'price-asc', 'price-desc'];

export interface ShopFilters {
  /** Category slug, not id — the URL carries slugs and so does the filter bar. */
  category?: string;
  brand?: string;
  /** Minor units, matching how prices are stored. */
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  sort?: ShopSort;
}

/**
 * Every condition except the product's own active flag, as separate pieces.
 *
 * Separate because the facet counts need to ask "how many products would match
 * if this one control were cleared" — a filter bar that shows the count of a
 * checkbox you have already ticked reports 1, always, and tells the shopper
 * nothing. Composing from parts is what makes that question answerable.
 */
function filterConditions(filters: ShopFilters): Record<string, SQL | undefined> {
  return {
    category: filters.category
      ? sql`exists (
          select 1 from ${productCategories}
          join ${categories} on ${categories.id} = ${productCategories.categoryId}
          where ${productCategories.productId} = ${products.id}
            and ${categories.slug} = ${filters.category}
            and ${categories.isActive}
        )`
      : undefined,

    brand: filters.brand
      ? sql`exists (
          select 1 from ${brands}
          where ${brands.id} = ${products.brandId} and ${brands.slug} = ${filters.brand}
        )`
      : undefined,

    minPrice: filters.minPrice != null ? gte(products.basePrice, filters.minPrice) : undefined,
    maxPrice: filters.maxPrice != null ? lte(products.basePrice, filters.maxPrice) : undefined,

    // Stock lives on variants, so this is an EXISTS rather than a column test.
    // A product with no variants at all is treated as available, matching what
    // getShopProduct already reports on the product page.
    inStock: filters.inStock
      ? sql`(
          not exists (select 1 from ${productVariants} where ${productVariants.productId} = ${products.id})
          or exists (
            select 1 from ${productVariants}
            where ${productVariants.productId} = ${products.id}
              and ${productVariants.isActive} and ${productVariants.stock} > 0
          )
        )`
      : undefined,

    onSale: filters.onSale
      ? sql`${products.compareAtPrice} is not null and ${products.compareAtPrice} > ${products.basePrice}`
      : undefined,
  };
}

function orderFor(sort: ShopSort | undefined) {
  switch (sort) {
    case 'newest': return [desc(products.createdAt)];
    case 'price-asc': return [asc(products.basePrice), asc(products.id)];
    case 'price-desc': return [desc(products.basePrice), asc(products.id)];
    // The shop's own arrangement, and the default: whatever the merchant
    // ordered by hand, newest first inside each rank.
    default: return [asc(products.sortOrder), desc(products.createdAt)];
  }
}

/** Active products for the shop grid, in the requested locale where it exists. */

/**
 * A product's text in the requested locale, falling back to whatever other
 * translation exists.
 *
 * These queries used to INNER JOIN product_i18n on the locale, so a product
 * with no English name did not merely lose its name on /en — it vanished from
 * the shop grid, 404'd on its own page, and dropped out of search. Two products
 * in the imported catalogue had a blank nameEn, so that is exactly what
 * happened to them.
 *
 * Content already behaves this way: lib/db/queries.ts LEFT JOINs its
 * translations and renders regardless. A missing translation is a content gap
 * to fill in, not grounds for hiding a product a shop is trying to sell.
 *
 * The outer column is written as raw `products.id`, NOT as an interpolated
 * ${products.id}. In a SELECT list with a single table in scope, drizzle emits
 * a column unqualified — `"id"` — which inside this subquery binds to
 * product_i18n's OWN id instead of the product's. The subquery then matches
 * nothing, coalesce falls through, and every product renders as its slug: no
 * error, no empty result, just quietly wrong text. It only appeared here
 * because removing the join left one table in scope; the same expression was
 * fine while the join existed. Qualifying explicitly makes it correct either
 * way, which is the point.
 */
type I18nColumn = 'name' | 'short_description' | 'description' | 'meta_title' | 'meta_description';

/**
 * The name, which must never be null — a nameless card is not a thing the grid
 * can render. Falls through translations to the slug as a last resort, the same
 * way an untitled page shows its path.
 */
function nameField(locale: 'ar' | 'en') {
  return sql<string>`coalesce(
    (select i.name from product_i18n i
      where i.product_id = products.id and i.locale::text = ${locale}),
    (select i.name from product_i18n i
      where i.product_id = products.id order by i.locale limit 1),
    products.slug
  )`;
}

function i18nField(column: I18nColumn, locale: 'ar' | 'en') {
  return sql<string | null>`coalesce(
    (select i.${sql.raw(column)} from product_i18n i
      where i.product_id = products.id and i.locale::text = ${locale}),
    (select i.${sql.raw(column)} from product_i18n i
      where i.product_id = products.id and i.${sql.raw(column)} is not null
      order by i.locale limit 1)
  )`;
}

export async function listShopProducts(
  locale: 'ar' | 'en',
  filters: ShopFilters = {},
  limit = 60
): Promise<ShopCard[]> {
  const conditions = filterConditions(filters);
  const where = and(
    eq(products.isActive, true),
    ...Object.values(conditions).filter((c): c is SQL => c !== undefined)
  );

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      name: nameField(locale),
      shortDesc: i18nField('short_description', locale),
    })
    .from(products)
    .where(where)
    .orderBy(...orderFor(filters.sort))
    .limit(limit);

  if (rows.length === 0) return [];

  const images = await db
    .select({ productId: productImages.productId, url: productImages.url, alt: productImages.alt })
    .from(productImages)
    .where(inArray(productImages.productId, rows.map((r) => r.id)))
    .orderBy(asc(productImages.sortOrder));

  const firstImage = new Map<string, { url: string; alt: string | null }>();
  for (const img of images) if (!firstImage.has(img.productId)) firstImage.set(img.productId, img);

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    shortDesc: r.shortDesc,
    basePrice: r.basePrice,
    compareAtPrice: r.compareAtPrice,
    image: firstImage.get(r.id) ?? null,
  }));
}

/** Full detail for one product page, or null when it should 404. */
export async function getShopProduct(slug: string, locale: 'ar' | 'en') {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      isActive: products.isActive,
      name: nameField(locale),
      shortDesc: i18nField('short_description', locale),
      description: i18nField('description', locale),
      metaTitle: i18nField('meta_title', locale),
      metaDescription: i18nField('meta_description', locale),
    })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);

  const product = rows[0];
  if (!product || !product.isActive) return null;

  const [images, specs, options, variants] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.sortOrder)),
    db.select().from(productSpecs)
      .where(and(eq(productSpecs.productId, product.id), eq(productSpecs.locale, locale)))
      .orderBy(asc(productSpecs.sortOrder)),
    db.select().from(productOptions).where(eq(productOptions.productId, product.id)).orderBy(asc(productOptions.position)),
    db.select().from(productVariants)
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true))),
  ]);

  const variantIds = variants.map((v) => v.id);
  const values = variantIds.length
    ? await db.select().from(variantOptionValues).where(inArray(variantOptionValues.variantId, variantIds))
    : [];

  // Distinct values per axis, in declaration order — this is what the selector
  // renders, and it is derived rather than stored so it can never drift.
  const optionValues = options.map((option) => ({
    id: option.id,
    name: option.name,
    values: [...new Set(values.filter((v) => v.optionId === option.id).map((v) => v.value))],
  }));

  const inStock = variants.length === 0 || variants.some((v) => (v.stock ?? 0) > 0);

  const optionNameById = new Map(options.map((o) => [o.id, o.name]));

  // Shaped for the client selector: each variant carries its axis -> value map.
  const selectable = variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    stock: v.stock ?? 0,
    values: Object.fromEntries(
      values
        .filter((ov) => ov.variantId === v.id)
        .map((ov) => [optionNameById.get(ov.optionId) ?? '', ov.value])
    ),
  }));

  return { product, images, specs, options: optionValues, variants, selectable, inStock };
}

export async function getShopCategory(slug: string, locale: 'ar' | 'en') {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      isActive: categories.isActive,
      name: categoryI18n.name,
    })
    .from(categories)
    .leftJoin(
      categoryI18n,
      and(eq(categoryI18n.categoryId, categories.id), eq(categoryI18n.locale, locale))
    )
    .where(eq(categories.slug, slug))
    .limit(1);

  const category = rows[0];
  return category && category.isActive ? category : null;
}

export interface FacetOption {
  slug: string;
  name: string;
  count: number;
}

export interface ShopFacets {
  total: number;
  categories: FacetOption[];
  brands: FacetOption[];
  /** Minor units across the WHOLE active catalogue, so the slider ends stay put. */
  priceMin: number;
  priceMax: number;
  inStock: number;
  onSale: number;
}

/**
 * Counts for the filter bar.
 *
 * Each facet is counted with its OWN condition removed, which is what makes the
 * numbers mean "tick this and you get 12" rather than "you have already ticked
 * this". Ticking a category and watching every other category drop to zero is
 * the classic version of this bug.
 *
 * The counts exist so the bar can hide a control that cannot narrow anything.
 * Against this catalogue today, in-stock matches 52 of 52 and on-sale 51 of 52:
 * a control that keeps everything is as useless to a shopper as one that keeps
 * nothing, and showing it teaches them the filters do not work.
 */
export async function getShopFacets(
  locale: 'ar' | 'en',
  filters: ShopFilters = {}
): Promise<ShopFacets> {
  const conditions = filterConditions(filters);

  /**
   * The grid INNER JOINs product_i18n, so a product with no name in this locale
   * is not on it. The counts have to agree, or the bar says "52 products" over
   * a grid of 50 — which is this catalogue exactly: two products have no
   * English name. A count that disagrees with what is on screen is worse than
   * no count.
   */
  const translated = sql`exists (
    select 1 from ${productI18n} where ${productI18n.productId} = ${products.id}
  )`;

  const active = and(eq(products.isActive, true), translated);

  /** Every condition except the named one. */
  const without = (key: keyof typeof conditions) =>
    and(
      active,
      ...Object.entries(conditions)
        .filter(([k, v]) => k !== key && v !== undefined)
        .map(([, v]) => v as SQL)
    );

  const all = and(
    active,
    ...Object.values(conditions).filter((c): c is SQL => c !== undefined)
  );

  // Price bounds ignore price so dragging a slider cannot shrink its own track.
  const priceWhere = and(
    active,
    ...Object.entries(conditions)
      .filter(([k, v]) => k !== 'minPrice' && k !== 'maxPrice' && v !== undefined)
      .map(([, v]) => v as SQL)
  );

  const [totalRow, categoryRows, brandRows, boundsRow, stockRow, saleRow] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(all),

    db
      .select({
        slug: categories.slug,
        name: sql<string>`coalesce(${categoryI18n.name}, ${categories.slug})`,
        count: sql<number>`count(distinct ${products.id})::int`,
      })
      .from(categories)
      .innerJoin(productCategories, eq(productCategories.categoryId, categories.id))
      .innerJoin(products, eq(products.id, productCategories.productId))
      .leftJoin(
        categoryI18n,
        and(eq(categoryI18n.categoryId, categories.id), eq(categoryI18n.locale, locale))
      )
      .where(and(eq(categories.isActive, true), without('category')))
      .groupBy(categories.id, categories.slug, categories.sortOrder, categoryI18n.name)
      .orderBy(asc(categories.sortOrder), asc(categories.slug)),

    db
      .select({
        slug: brands.slug,
        name: brands.name,
        count: sql<number>`count(distinct ${products.id})::int`,
      })
      .from(brands)
      .innerJoin(products, eq(products.brandId, brands.id))
      .where(and(eq(brands.isActive, true), without('brand')))
      .groupBy(brands.id, brands.slug, brands.name, brands.sortOrder)
      .orderBy(asc(brands.sortOrder), asc(brands.name)),

    db
      .select({
        min: sql<number>`coalesce(min(${products.basePrice}), 0)::int`,
        max: sql<number>`coalesce(max(${products.basePrice}), 0)::int`,
      })
      .from(products)
      .where(priceWhere),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .where(
        and(
          without('inStock'),
          sql`(
            not exists (select 1 from ${productVariants} where ${productVariants.productId} = ${products.id})
            or exists (
              select 1 from ${productVariants}
              where ${productVariants.productId} = ${products.id}
                and ${productVariants.isActive} and ${productVariants.stock} > 0
            )
          )`
        )
      ),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .where(
        and(
          without('onSale'),
          sql`${products.compareAtPrice} is not null and ${products.compareAtPrice} > ${products.basePrice}`
        )
      ),
  ]);

  return {
    total: totalRow[0]?.n ?? 0,
    categories: categoryRows,
    brands: brandRows,
    priceMin: boundsRow[0]?.min ?? 0,
    priceMax: boundsRow[0]?.max ?? 0,
    inStock: stockRow[0]?.n ?? 0,
    onSale: saleRow[0]?.n ?? 0,
  };
}
