// lib/commerce/storefront.ts
import { db } from '@/lib/db';
import {
  products, productI18n, productImages, productVariants,
  productOptions, variantOptionValues, productSpecs, categories, categoryI18n,
} from '@/lib/db/schema';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

export interface ShopCard {
  slug: string;
  name: string;
  shortDesc: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  image: { url: string; alt: string | null } | null;
}

/**
 * Active products for the shop grid.
 *
 * innerJoin on productI18n: a product with no translation for this locale has
 * no name to show, so it is omitted rather than rendered as its slug — the same
 * rule the content archives use.
 */
export async function listShopProducts(
  locale: 'ar' | 'en',
  categoryId?: string,
  limit = 60
): Promise<ShopCard[]> {
  const where = categoryId
    ? and(eq(products.isActive, true), eq(products.categoryId, categoryId))
    : eq(products.isActive, true);

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      basePrice: products.basePrice,
      compareAtPrice: products.compareAtPrice,
      name: productI18n.name,
      shortDesc: productI18n.shortDesc,
    })
    .from(products)
    .innerJoin(
      productI18n,
      and(eq(productI18n.productId, products.id), eq(productI18n.locale, locale))
    )
    .where(where)
    .orderBy(asc(products.sortOrder), desc(products.createdAt))
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
      name: productI18n.name,
      shortDesc: productI18n.shortDesc,
      description: productI18n.description,
      metaTitle: productI18n.metaTitle,
      metaDescription: productI18n.metaDescription,
    })
    .from(products)
    .innerJoin(
      productI18n,
      and(eq(productI18n.productId, products.id), eq(productI18n.locale, locale))
    )
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

  return { product, images, specs, options: optionValues, variants, inStock };
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
