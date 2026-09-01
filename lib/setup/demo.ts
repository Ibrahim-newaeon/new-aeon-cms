// lib/setup/demo.ts
import 'server-only';
import { db } from '@/lib/db';
import {
  products, productI18n, productVariants, productImages,
  brands, categories, categoryI18n, shippingZones,
} from '@/lib/db/schema';
import { setProductCategories } from '@/lib/commerce/product-categories';
import { eq } from 'drizzle-orm';

/**
 * The demo catalogue, shared by the setup wizard and `npm run db:seed`.
 *
 * One definition, two callers. It lived only inside the seed script, which is
 * not in the production image at all — so the wizard would have had to restate
 * it, and the two copies would have drifted the first time either changed.
 *
 * The fixtures are chosen for the PROPERTIES a shop needs to be explorable
 * rather than for realism: two brands and two categories so the facets can
 * narrow, a 19–249 spread so price sorting and range filters have something to
 * order, three on sale so that facet is not all-or-nothing, one out of stock,
 * and every one bilingual — a product with one language is not live, so it
 * would be missing from the grid and the counts would disagree with it.
 */

const BRANDS = [
  ['aeon-atelier', 'Aeon Atelier'],
  ['levant-house', 'Levant House'],
] as const;

const CATEGORIES = [
  ['perfumes', 'عطور', 'Perfumes'],
  ['gifts', 'هدايا', 'Gifts'],
] as const;

const PRODUCTS = [
  { slug: 'oud-royal',      ar: 'عود ملكي',          en: 'Oud Royal',         price: 249000, was: null,   stock: 12, brand: 'aeon-atelier', cat: 'perfumes' },
  { slug: 'rose-damascena', ar: 'ورد دمشقي',         en: 'Rose Damascena',    price: 189000, was: 229000, stock: 8,  brand: 'aeon-atelier', cat: 'perfumes' },
  { slug: 'musk-white',     ar: 'مسك أبيض',          en: 'White Musk',        price: 79000,  was: null,   stock: 30, brand: 'levant-house', cat: 'perfumes' },
  { slug: 'amber-travel',   ar: 'عنبر للسفر',        en: 'Amber Travel Size', price: 39000,  was: 49000,  stock: 45, brand: 'levant-house', cat: 'gifts' },
  { slug: 'gift-box-duo',   ar: 'علبة هدايا ثنائية', en: 'Gift Box Duo',      price: 119000, was: 149000, stock: 6,  brand: 'aeon-atelier', cat: 'gifts' },
  { slug: 'sampler-set',    ar: 'طقم عينات',         en: 'Sampler Set',       price: 19000,  was: null,   stock: 0,  brand: 'levant-house', cat: 'gifts' },
] as const;

export interface DemoResult {
  products: number;
  skipped: number;
}

/**
 * Idempotent: every row is keyed on its slug and skipped if present, so
 * running this twice cannot duplicate a catalogue, and a shop that has since
 * edited a demo product keeps its edits.
 */
export async function installDemoContent(): Promise<DemoResult> {
  const brandIds = new Map<string, string>();
  for (const [slug, name] of BRANDS) {
    const [existing] = await db.select().from(brands).where(eq(brands.slug, slug)).limit(1);
    if (existing) { brandIds.set(slug, existing.id); continue; }
    const [row] = await db.insert(brands).values({ slug, name, isActive: true }).onConflictDoNothing().returning();
    if (row) brandIds.set(slug, row.id);
  }

  const catIds = new Map<string, string>();
  for (const [slug, ar, en] of CATEGORIES) {
    const [existing] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    if (existing) { catIds.set(slug, existing.id); continue; }
    const [row] = await db.insert(categories).values({ slug, isActive: true }).onConflictDoNothing().returning();
    if (!row) continue;
    catIds.set(slug, row.id);
    await db.insert(categoryI18n).values([
      { categoryId: row.id, locale: 'ar', name: ar },
      { categoryId: row.id, locale: 'en', name: en },
    ]);
  }

  let made = 0;
  let skipped = 0;

  for (const p of PRODUCTS) {
    const [exists] = await db.select({ id: products.id }).from(products).where(eq(products.slug, p.slug)).limit(1);
    if (exists) { skipped += 1; continue; }

    const [product] = await db
      .insert(products)
      .values({
        slug: p.slug,
        brandId: brandIds.get(p.brand),
        basePrice: p.price,
        // On the PRODUCT as well as the variant: the storefront reads
        // compare-at from here, and writing it only to the variant is how an
        // import once reported "53 updated" and changed nothing visible.
        compareAtPrice: p.was,
        isActive: true,
      })
      .returning();
    if (!product) continue;

    const catId = catIds.get(p.cat);
    if (catId) await setProductCategories(product.id, [catId]);

    await db.insert(productI18n).values([
      { productId: product.id, locale: 'ar', name: p.ar, shortDesc: `${p.ar} من المتجر.`, description: `${p.ar} — من المجموعة.` },
      { productId: product.id, locale: 'en', name: p.en, shortDesc: `${p.en}, from the collection.`, description: `${p.en} — from the collection.` },
    ]);

    await db.insert(productVariants).values({
      productId: product.id,
      sku: p.slug.toUpperCase(),
      price: p.price,
      compareAtPrice: p.was,
      stock: p.stock,
      isActive: true,
    });

    await db.insert(productImages).values({
      // A committed placeholder under public/seed, not public/uploads — that
      // directory is gitignored user content and would be missing everywhere
      // except the machine that uploaded to it.
      productId: product.id,
      url: '/seed/amber-oud.png',
      alt: p.en,
      sortOrder: 0,
    });

    made += 1;
  }

  // Without a zone covering somewhere, checkout cannot quote a delivery price
  // and the demo stops at the cart.
  const [zone] = await db.select().from(shippingZones).where(eq(shippingZones.name, 'Central')).limit(1);
  if (!zone) {
    await db.insert(shippingZones).values({
      name: 'Central',
      governorates: ['amman', 'zarqa', 'balqa', 'madaba'],
      flatRate: 3000,
      freeOver: 100000,
      etaDays: 2,
      isActive: true,
      sortOrder: 1,
    });
  }

  return { products: made, skipped };
}
