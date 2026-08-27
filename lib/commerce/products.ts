// lib/commerce/products.ts
import { db } from '@/lib/db';
import {
  products, productI18n, productImages, productSpecs, productVariants,
  productOptions, variantOptionValues, brands, categories, categoryI18n,
} from '@/lib/db/schema';
import { and, asc, count, desc, eq, inArray, ne } from 'drizzle-orm';
import type { ProductInput } from '@/lib/commerce-schema';

/**
 * Writes a product's options, variants and their option values.
 *
 * Delete-and-recreate rather than diffing. Variants are identified by their
 * option combination, not by a stable id the editor holds, so a diff would have
 * to guess which row an edited variant used to be. Recreating is simpler and,
 * until orders exist (C2), nothing references a variant id. **When C2 lands,
 * order_items will reference variants and this must become a diff** — noted
 * here rather than left as a surprise.
 */
export async function writeProductStructure(
  productId: string,
  data: Pick<ProductInput, 'options' | 'variants' | 'images' | 'specs'>
): Promise<void> {
  // Cascades remove variantOptionValues with their variant/option.
  await db.delete(productVariants).where(eq(productVariants.productId, productId));
  await db.delete(productOptions).where(eq(productOptions.productId, productId));
  await db.delete(productImages).where(eq(productImages.productId, productId));
  await db.delete(productSpecs).where(eq(productSpecs.productId, productId));

  const optionIdByName = new Map<string, string>();
  if (data.options.length > 0) {
    const inserted = await db
      .insert(productOptions)
      .values(
        data.options.map((o, i) => ({
          productId,
          name: o.name,
          position: o.position ?? i,
        }))
      )
      .returning({ id: productOptions.id, name: productOptions.name });

    for (const row of inserted) optionIdByName.set(row.name, row.id);
  }

  for (const variant of data.variants) {
    const [row] = await db
      .insert(productVariants)
      .values({
        productId,
        sku: variant.sku,
        barcode: variant.barcode || null,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice ?? null,
        stock: variant.stock,
        lowStockThreshold: variant.lowStockThreshold,
        weightGrams: variant.weightGrams ?? null,
        isActive: variant.isActive,
      })
      .returning({ id: productVariants.id });

    if (!row) continue;

    const values = Object.entries(variant.optionValues)
      .map(([name, value]) => ({ optionId: optionIdByName.get(name), value }))
      .filter((v): v is { optionId: string; value: string } => Boolean(v.optionId));

    if (values.length > 0) {
      await db.insert(variantOptionValues).values(
        values.map((v) => ({ variantId: row.id, optionId: v.optionId, value: v.value }))
      );
    }
  }

  if (data.images.length > 0) {
    await db.insert(productImages).values(
      data.images.map((img, i) => ({
        productId,
        url: img.url,
        alt: img.alt || null,
        sortOrder: i,
      }))
    );
  }

  if (data.specs.length > 0) {
    await db.insert(productSpecs).values(
      data.specs.map((s, i) => ({
        productId,
        locale: s.locale,
        key: s.key,
        value: s.value,
        sortOrder: i,
      }))
    );
  }
}

/** Rejects a slug already used by a different product. */
export async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(excludeId ? and(eq(products.slug, slug), ne(products.id, excludeId)) : eq(products.slug, slug))
    .limit(1);
  return Boolean(rows[0]);
}

/** Admin list rows, already serialized. */
export async function listProductsForAdmin(locale: 'ar' | 'en' = 'ar') {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      basePrice: products.basePrice,
      isActive: products.isActive,
      createdAt: products.createdAt,
      name: productI18n.name,
    })
    .from(products)
    .leftJoin(
      productI18n,
      and(eq(productI18n.productId, products.id), eq(productI18n.locale, locale))
    )
    .orderBy(asc(products.sortOrder), desc(products.createdAt));

  const variantCounts = await db
    .select({ productId: productVariants.productId, n: count() })
    .from(productVariants)
    .groupBy(productVariants.productId);

  const countByProduct = new Map(variantCounts.map((v) => [v.productId, Number(v.n)]));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    basePrice: r.basePrice,
    isActive: r.isActive,
    variantCount: countByProduct.get(r.id) ?? 0,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  }));
}

/** Everything the editor needs for one product. */
export async function getProductForEdit(id: string) {
  const base = await db.select().from(products).where(eq(products.id, id)).limit(1);
  const product = base[0];
  if (!product) return null;

  const [i18n, images, specs, options, variants] = await Promise.all([
    db.select().from(productI18n).where(eq(productI18n.productId, id)),
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder)),
    db.select().from(productSpecs).where(eq(productSpecs.productId, id)).orderBy(asc(productSpecs.sortOrder)),
    db.select().from(productOptions).where(eq(productOptions.productId, id)).orderBy(asc(productOptions.position)),
    db.select().from(productVariants).where(eq(productVariants.productId, id)).orderBy(asc(productVariants.sku)),
  ]);

  const variantIds = variants.map((v) => v.id);
  const optionValues = variantIds.length
    ? await db.select().from(variantOptionValues).where(inArray(variantOptionValues.variantId, variantIds))
    : [];

  const optionNameById = new Map(options.map((o) => [o.id, o.name]));

  return {
    product,
    i18n,
    images,
    specs,
    options,
    variants: variants.map((v) => ({
      ...v,
      optionValues: Object.fromEntries(
        optionValues
          .filter((ov) => ov.variantId === v.id)
          .map((ov) => [optionNameById.get(ov.optionId) ?? '', ov.value])
      ),
    })),
  };
}

/** Brand and category choices for the editor selects. */
export async function getProductFormOptions(locale: 'ar' | 'en' = 'ar') {
  const [brandRows, categoryRows] = await Promise.all([
    db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(eq(brands.isActive, true))
      .orderBy(asc(brands.sortOrder)),
    db
      .select({ id: categories.id, slug: categories.slug, name: categoryI18n.name })
      .from(categories)
      .leftJoin(
        categoryI18n,
        and(eq(categoryI18n.categoryId, categories.id), eq(categoryI18n.locale, locale))
      )
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder)),
  ]);

  return {
    brands: brandRows.map((b) => ({ id: b.id, label: b.name })),
    categories: categoryRows.map((c) => ({ id: c.id, label: c.name ?? c.slug })),
  };
}
