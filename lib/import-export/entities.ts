// lib/import-export/entities.ts
import 'server-only';
import { and, asc, count, eq, inArray, sql, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  productImages,
  categories,
  categoryI18n,
  coupons,
  customers,
  orders,
  productI18n,
  productOptions,
  productReviews,
  productVariants,
  products,
  tagI18n,
  tags,
} from '@/lib/db/schema';
import { getSettings } from '@/lib/db/queries';
import { minorUnitExponent } from '@/lib/money';
import { normalisePhone } from '@/lib/commerce/phone';
import { headersFor, type EntityDef } from './registry';
import { fromMinorUnits, parseBoolean, toMinorUnits, type ImportPlan } from './plan';
import type { Table } from './table';

/**
 * The database half of import/export.
 *
 * Everything here is per-entity and boring on purpose: reading rows out, and
 * applying a plan the caller has already validated. The sorting, validation and
 * dry-run logic live in plan.ts, where they can be tested without a database.
 */

const yesNo = (value: boolean | null) => (value ? 'yes' : 'no');
const currencyExponent = async () => minorUnitExponent((await getSettings())?.currency ?? 'JOD');

/** Rows for the export file, in the entity's own column order. */
export async function exportTable(entity: EntityDef): Promise<Table> {
  const headers = headersFor(entity);
  const dicts = await exportRows(entity);
  return { headers, rows: dicts.map((row) => headers.map((h) => row[h] ?? '')) };
}

async function exportRows(entity: EntityDef): Promise<Record<string, string>[]> {
  switch (entity.id) {
    case 'products': {
      const exponent = await currencyExponent();
      const rows = await db
        .select({
          sku: productVariants.sku,
          slug: products.slug,
          price: productVariants.price,
          compareAt: productVariants.compareAtPrice,
          stock: productVariants.stock,
          active: productVariants.isActive,
          brand: brands.slug,
          category: categories.slug,
          productId: products.id,
          variantId: productVariants.id,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .leftJoin(brands, eq(products.brandId, brands.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .orderBy(asc(products.slug), asc(productVariants.sku));

      if (rows.length === 0) return [];

      const productIds = [...new Set(rows.map((r) => r.productId))];

      const images = await db
        .select({ productId: productImages.productId, url: productImages.url })
        .from(productImages)
        .where(inArray(productImages.productId, productIds))
        .orderBy(asc(productImages.sortOrder));

      // First image only: the sheet has one column, and exporting the second
      // into it would round-trip as a reordering nobody asked for.
      const imageOf = new Map<string, string>();
      for (const image of images) {
        if (!imageOf.has(image.productId)) imageOf.set(image.productId, image.url);
      }

      const names = await db
        .select({ productId: productI18n.productId, locale: productI18n.locale, name: productI18n.name })
        .from(productI18n)
        .where(inArray(productI18n.productId, productIds));

      const nameOf = new Map<string, string>();
      for (const n of names) nameOf.set(`${n.productId}|${n.locale}`, n.name);

      return rows.map((row) => ({
        sku: row.sku,
        slug: row.slug,
        name_en: nameOf.get(`${row.productId}|en`) ?? '',
        name_ar: nameOf.get(`${row.productId}|ar`) ?? '',
        brand: row.brand ?? '',
        category: row.category ?? '',
        price: fromMinorUnits(row.price, exponent),
        compare_at_price: row.compareAt === null ? '' : fromMinorUnits(row.compareAt, exponent),
        stock: String(row.stock ?? 0),
        // Options are exported blank rather than wrong: a variant can carry
        // several, and collapsing them into one pair would round-trip as a
        // silent data loss.
        option_name: '',
        option_value: '',
        image_url: imageOf.get(row.productId) ?? '',
        active: yesNo(row.active),
      }));
    }

    case 'coupons': {
      const exponent = await currencyExponent();
      const rows = await db.select().from(coupons).orderBy(asc(coupons.code));
      return rows.map((c) => ({
        code: c.code,
        type: c.type,
        // A percent coupon's value is a percentage, not money — converting it
        // through the currency would turn 10% into 0.010.
        value: c.type === 'percent' ? String(c.value) : fromMinorUnits(c.value, exponent),
        min_subtotal: c.minSubtotal ? fromMinorUnits(c.minSubtotal, exponent) : '',
        max_uses: c.usageLimit === null ? '' : String(c.usageLimit),
        expires_at: c.endsAt ? c.endsAt.toISOString().slice(0, 10) : '',
        active: yesNo(c.isActive),
      }));
    }

    case 'categories': {
      const rows = await db
        .select({
          slug: categories.slug,
          parentId: categories.parentId,
          sortOrder: categories.sortOrder,
          active: categories.isActive,
          id: categories.id,
        })
        .from(categories)
        .orderBy(asc(categories.slug));

      const names = await db.select().from(categoryI18n);
      const nameOf = new Map(names.map((n) => [`${n.categoryId}|${n.locale}`, n.name]));
      const slugOf = new Map(rows.map((r) => [r.id, r.slug]));

      return rows.map((row) => ({
        slug: row.slug,
        name_en: nameOf.get(`${row.id}|en`) ?? '',
        name_ar: nameOf.get(`${row.id}|ar`) ?? '',
        parent: row.parentId ? (slugOf.get(row.parentId) ?? '') : '',
        sort_order: String(row.sortOrder ?? 0),
        active: yesNo(row.active),
      }));
    }

    case 'brands': {
      const rows = await db.select().from(brands).orderBy(asc(brands.slug));
      return rows.map((b) => ({
        slug: b.slug,
        name: b.name,
        logo_url: b.logoUrl ?? '',
        sort_order: String(b.sortOrder ?? 0),
        active: yesNo(b.isActive),
      }));
    }

    case 'tags': {
      const rows = await db.select().from(tags).orderBy(asc(tags.slug));
      const names = await db.select().from(tagI18n);
      const nameOf = new Map(names.map((n) => [`${n.tagId}|${n.locale}`, n.name]));
      return rows.map((tag) => ({
        slug: tag.slug,
        name: tag.name,
        name_en: nameOf.get(`${tag.id}|en`) ?? '',
        name_ar: nameOf.get(`${tag.id}|ar`) ?? '',
      }));
    }

    case 'reviews': {
      const rows = await db
        .select({
          sku: productVariants.sku,
          author: productReviews.customerName,
          phone: productReviews.phone,
          rating: productReviews.rating,
          body: productReviews.body,
          status: productReviews.status,
        })
        .from(productReviews)
        .innerJoin(products, eq(productReviews.productId, products.id))
        // A review belongs to a product; the sheet keys on a SKU, so the
        // product's first variant stands for it.
        .innerJoin(productVariants, eq(productVariants.productId, products.id))
        .orderBy(asc(productReviews.createdAt));

      const seen = new Set<string>();
      return rows
        .filter((r) => {
          const key = `${r.phone}|${r.author}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((r) => ({
          product_sku: r.sku,
          author: r.author,
          phone: r.phone,
          rating: String(r.rating),
          body: r.body,
          status: r.status,
        }));
    }

    case 'customers': {
      const exponent = await currencyExponent();
      const rows = await db
        .select({
          name: customers.name,
          phone: customers.phone,
          email: customers.email,
          orderCount: count(orders.id),
          spent: sum(orders.total),
          first: sql<string | null>`min(${orders.createdAt})`,
          last: sql<string | null>`max(${orders.createdAt})`,
        })
        .from(customers)
        .leftJoin(orders, eq(orders.customerId, customers.id))
        .groupBy(customers.id, customers.name, customers.phone, customers.email)
        .orderBy(asc(customers.name));

      return rows.map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email ?? '',
        orders: String(c.orderCount ?? 0),
        total_spent: fromMinorUnits(Number(c.spent ?? 0), exponent),
        first_order: c.first ? String(c.first).slice(0, 10) : '',
        last_order: c.last ? String(c.last).slice(0, 10) : '',
      }));
    }

    default:
      return [];
  }
}

/** The natural keys already in the database, so the plan knows create vs update. */
export async function existingKeys(entity: EntityDef): Promise<Set<string>> {
  const rows = await exportRows(entity);
  const keys = new Set<string>();
  if (!entity.naturalKey) return keys;

  for (const row of rows) {
    const parts = entity.naturalKey.split('|').map((k) => (row[k] ?? '').trim().toLowerCase());
    if (parts.every((p) => p !== '')) keys.add(parts.join('|'));
  }
  return keys;
}

export interface ApplyResult {
  created: number;
  updated: number;
  failed: { key: string; message: string }[];
}

/**
 * Applies a plan.
 *
 * Per row rather than one transaction for the file: a 500-row import that
 * fails on row 400 should leave 399 products updated and tell you which one
 * broke, not roll back an afternoon's work. The dry run has already rejected
 * anything malformed, so what fails here is a genuine database conflict.
 */
export async function applyPlan(entity: EntityDef, plan: ImportPlan): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, updated: 0, failed: [] };
  const rows = [...plan.create, ...plan.update.map((u) => u.values)];

  for (const row of rows) {
    try {
      const created = await upsert(entity, row);
      if (created) result.created++;
      else result.updated++;
    } catch (error) {
      result.failed.push({
        key: entity.naturalKey ? (row[entity.naturalKey.split('|')[0]!] ?? '') : '',
        message: error instanceof Error ? error.message : 'failed',
      });
    }
  }

  return result;
}

/** Returns true when a new record was created. */
async function upsert(entity: EntityDef, row: Record<string, string>): Promise<boolean> {
  switch (entity.id) {
    case 'products':
      return upsertProduct(row);
    case 'coupons':
      return upsertCoupon(row);
    case 'categories':
      return upsertCategory(row);
    case 'brands':
      return upsertBrand(row);
    case 'tags':
      return upsertTag(row);
    case 'reviews':
      return upsertReview(row);
    default:
      throw new Error(`${entity.id} cannot be imported`);
  }
}

async function upsertProduct(row: Record<string, string>): Promise<boolean> {
  const exponent = await currencyExponent();
  const price = toMinorUnits(row.price ?? '', exponent);
  if (price === null) throw new Error('price is not a number');
  const compareAt = row.compare_at_price ? toMinorUnits(row.compare_at_price, exponent) : null;

  const brandId = row.brand ? await lookupId(brands, brands.slug, row.brand) : null;
  const categoryId = row.category ? await lookupId(categories, categories.slug, row.category) : null;

  const [existingProduct] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, row.slug!))
    .limit(1);

  let productId = existingProduct?.id;
  if (!productId) {
    const [created] = await db
      .insert(products)
      .values({
        slug: row.slug!,
        brandId,
        categoryId,
        basePrice: price,
        isActive: parseBoolean(row.active ?? ''),
      })
      .returning({ id: products.id });
    productId = created!.id;
  } else {
    await db
      .update(products)
      .set({ brandId, categoryId, basePrice: price, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }

  for (const [locale, name] of [['en', row.name_en], ['ar', row.name_ar]] as const) {
    if (!name) continue;
    const [existing] = await db
      .select({ id: productI18n.id })
      .from(productI18n)
      .where(and(eq(productI18n.productId, productId), eq(productI18n.locale, locale)))
      .limit(1);

    if (existing) await db.update(productI18n).set({ name }).where(eq(productI18n.id, existing.id));
    else await db.insert(productI18n).values({ productId, locale, name });
  }

  if (row.image_url) {
    // One primary image per product, replaced rather than appended: re-running
    // an import would otherwise stack a duplicate on every pass.
    const [existingImage] = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(and(eq(productImages.productId, productId), eq(productImages.sortOrder, 0)))
      .limit(1);

    if (existingImage) {
      await db
        .update(productImages)
        .set({ url: row.image_url, alt: row.name_en || row.name_ar || null })
        .where(eq(productImages.id, existingImage.id));
    } else {
      await db.insert(productImages).values({
        productId,
        url: row.image_url,
        alt: row.name_en || row.name_ar || null,
        sortOrder: 0,
      });
    }
  }

  const [existingVariant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.sku, row.sku!))
    .limit(1);

  const stock = Number(row.stock ?? 0);
  if (existingVariant) {
    await db
      .update(productVariants)
      .set({ price, compareAtPrice: compareAt, stock, isActive: parseBoolean(row.active ?? '') })
      .where(eq(productVariants.id, existingVariant.id));
    return false;
  }

  const [variant] = await db
    .insert(productVariants)
    .values({
      productId,
      sku: row.sku!,
      price,
      compareAtPrice: compareAt,
      stock,
      isActive: parseBoolean(row.active ?? ''),
    })
    .returning({ id: productVariants.id });

  // The option pair is optional; a product with a single variant does not
  // need one, and inventing "Default" would show a pointless picker.
  if (row.option_name && row.option_value && variant) {
    const [option] = await db
      .insert(productOptions)
      .values({ productId, name: row.option_name })
      .onConflictDoNothing()
      .returning({ id: productOptions.id });

    const optionId =
      option?.id ??
      (
        await db
          .select({ id: productOptions.id })
          .from(productOptions)
          .where(and(eq(productOptions.productId, productId), eq(productOptions.name, row.option_name)))
          .limit(1)
      )[0]?.id;

    if (optionId) {
      await db
        .insert(variantOptionValuesTable)
        .values({ variantId: variant.id, optionId, value: row.option_value })
        .onConflictDoNothing();
    }
  }

  return true;
}

// Imported separately so the products branch reads without a long import list
// at the top competing for attention.
import { variantOptionValues as variantOptionValuesTable } from '@/lib/db/schema';

async function upsertCoupon(row: Record<string, string>): Promise<boolean> {
  const exponent = await currencyExponent();
  const type = row.type as 'percent' | 'fixed';
  const raw = row.value ?? '';
  const value = type === 'percent' ? Number(raw) : toMinorUnits(raw, exponent);
  if (value === null || !Number.isFinite(value)) throw new Error('value is not a number');

  const values = {
    code: row.code!.toUpperCase(),
    type,
    value,
    minSubtotal: row.min_subtotal ? (toMinorUnits(row.min_subtotal, exponent) ?? 0) : 0,
    usageLimit: row.max_uses ? Number(row.max_uses) : null,
    endsAt: row.expires_at ? new Date(`${row.expires_at}T23:59:59Z`) : null,
    isActive: parseBoolean(row.active ?? ''),
  };

  const [existing] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.code, values.code))
    .limit(1);

  if (existing) {
    await db.update(coupons).set(values).where(eq(coupons.id, existing.id));
    return false;
  }
  await db.insert(coupons).values(values);
  return true;
}

async function upsertCategory(row: Record<string, string>): Promise<boolean> {
  const parentId = row.parent ? await lookupId(categories, categories.slug, row.parent) : null;
  if (row.parent && !parentId) throw new Error(`parent category "${row.parent}" does not exist`);

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, row.slug!))
    .limit(1);

  let id = existing?.id;
  const values = {
    slug: row.slug!,
    parentId,
    sortOrder: row.sort_order ? Number(row.sort_order) : 0,
    isActive: parseBoolean(row.active ?? ''),
  };

  if (id) {
    await db.update(categories).set(values).where(eq(categories.id, id));
  } else {
    const [created] = await db.insert(categories).values(values).returning({ id: categories.id });
    id = created!.id;
  }

  for (const [locale, name] of [['en', row.name_en], ['ar', row.name_ar]] as const) {
    if (!name) continue;
    const [existingName] = await db
      .select({ id: categoryI18n.id })
      .from(categoryI18n)
      .where(and(eq(categoryI18n.categoryId, id), eq(categoryI18n.locale, locale)))
      .limit(1);

    if (existingName) await db.update(categoryI18n).set({ name }).where(eq(categoryI18n.id, existingName.id));
    else await db.insert(categoryI18n).values({ categoryId: id, locale, name });
  }

  return !existing;
}

async function upsertBrand(row: Record<string, string>): Promise<boolean> {
  const values = {
    slug: row.slug!,
    name: row.name!,
    logoUrl: row.logo_url || null,
    sortOrder: row.sort_order ? Number(row.sort_order) : 0,
    isActive: parseBoolean(row.active ?? ''),
  };

  const [existing] = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, values.slug)).limit(1);
  if (existing) {
    await db.update(brands).set(values).where(eq(brands.id, existing.id));
    return false;
  }
  await db.insert(brands).values(values);
  return true;
}

async function upsertTag(row: Record<string, string>): Promise<boolean> {
  const [existing] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, row.slug!)).limit(1);

  let id = existing?.id;
  if (id) {
    await db.update(tags).set({ name: row.name! }).where(eq(tags.id, id));
  } else {
    const [created] = await db
      .insert(tags)
      .values({ slug: row.slug!, name: row.name! })
      .returning({ id: tags.id });
    id = created!.id;
  }

  for (const [locale, name] of [['en', row.name_en], ['ar', row.name_ar]] as const) {
    if (!name) continue;
    const [existingName] = await db
      .select({ id: tagI18n.id })
      .from(tagI18n)
      .where(and(eq(tagI18n.tagId, id), eq(tagI18n.locale, locale)))
      .limit(1);

    if (existingName) await db.update(tagI18n).set({ name }).where(eq(tagI18n.id, existingName.id));
    else await db.insert(tagI18n).values({ tagId: id, locale, name });
  }

  return !existing;
}

async function upsertReview(row: Record<string, string>): Promise<boolean> {
  const [variant] = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.sku, row.product_sku!))
    .limit(1);

  if (!variant) throw new Error(`no product with SKU "${row.product_sku}"`);

  // The same normalisation the checkout uses, so a review imported as "+962 7…"
  // belongs to the same person as one left as "07…".
  const phone = normalisePhone(row.phone!);
  const values = {
    productId: variant.productId,
    customerName: row.author!,
    phone,
    rating: Number(row.rating),
    body: row.body || '',
    status: (row.status || 'pending') as 'pending' | 'approved' | 'rejected',
  };

  const [existing] = await db
    .select({ id: productReviews.id })
    .from(productReviews)
    .where(and(eq(productReviews.productId, variant.productId), eq(productReviews.phone, phone)))
    .limit(1);

  if (existing) {
    await db.update(productReviews).set(values).where(eq(productReviews.id, existing.id));
    return false;
  }
  await db.insert(productReviews).values(values);
  return true;
}

/** Slug → id, or null. */
async function lookupId(
  table: typeof brands | typeof categories,
  column: typeof brands.slug | typeof categories.slug,
  slug: string
): Promise<string | null> {
  const [found] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(column, slug.trim()))
    .limit(1);
  return found?.id ?? null;
}
