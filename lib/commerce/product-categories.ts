// lib/commerce/product-categories.ts
import { db } from '@/lib/db';
import { productCategories } from '@/lib/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';

/**
 * Replaces a product's category links.
 *
 * Delete-then-insert, mirroring setContentTaxonomy: the set is small and the
 * only extra column is derived from position, so there is nothing to preserve.
 *
 * The FIRST id is the primary category — the one that owns the product's
 * breadcrumb and its canonical /shop/[category] URL. Callers pass an ordered
 * array; order in, primacy out.
 */
export async function setProductCategories(
  productId: string,
  categoryIds: string[]
): Promise<void> {
  await db.delete(productCategories).where(eq(productCategories.productId, productId));
  if (categoryIds.length === 0) return;

  // Deduplicated while preserving order: the same category listed twice would
  // otherwise violate the composite primary key and abort the whole write.
  const unique = [...new Set(categoryIds)];

  await db.insert(productCategories).values(
    unique.map((categoryId, i) => ({ productId, categoryId, isPrimary: i === 0 }))
  );
}

/** Category ids for one product, primary first. */
export async function getProductCategories(productId: string): Promise<string[]> {
  const rows = await db
    .select({ categoryId: productCategories.categoryId, isPrimary: productCategories.isPrimary })
    .from(productCategories)
    .where(eq(productCategories.productId, productId))
    .orderBy(asc(productCategories.isPrimary));

  // asc() puts false before true, so the primary lands last — flip it here
  // rather than relying on a DESC that reads as "newest first".
  return rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((r) => r.categoryId);
}

/** Category ids for many products at once, keyed by product id, primary first. */
export async function getProductCategoryMap(
  productIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (productIds.length === 0) return map;

  const rows = await db
    .select({
      productId: productCategories.productId,
      categoryId: productCategories.categoryId,
      isPrimary: productCategories.isPrimary,
    })
    .from(productCategories)
    .where(inArray(productCategories.productId, productIds));

  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    if (row.isPrimary) list.unshift(row.categoryId);
    else list.push(row.categoryId);
    map.set(row.productId, list);
  }
  return map;
}
