// app/(admin)/admin/commerce/bundles/page.tsx
import { db } from '@/lib/db';
import {
  productBundles,
  bundleItems,
  productVariants,
  products,
  productI18n,
} from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getSettings } from '@/lib/db/queries';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import {
  BundlesManager,
  type BundleRow,
  type VariantOption,
} from '@/components/admin/bundles-manager';

export const dynamic = 'force-dynamic';

export default async function BundlesPage() {
  const locale = await getAdminLocale();
  const t = createTranslator(locale);

  const [bundles, items, variantRows, settings] = await Promise.all([
    db.select().from(productBundles).orderBy(asc(productBundles.sortOrder)),
    db.select().from(bundleItems),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        price: productVariants.price,
        productSlug: products.slug,
        productName: productI18n.name,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(
        productI18n,
        and(eq(productI18n.productId, products.id), eq(productI18n.locale, locale))
      )
      .orderBy(asc(productVariants.sku)),
    getSettings(),
  ]);

  const priceOf = new Map(variantRows.map((v) => [v.id, v.price]));

  const rows: BundleRow[] = bundles.map((b) => {
    const own = items.filter((i) => i.bundleId === b.id);

    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      description: b.description,
      price: b.price,
      isActive: b.isActive ?? true,
      items: own.map((i) => ({ variantId: i.variantId, qty: i.qty })),
      // What the parts cost separately, so the saving is visible at a glance.
      partsTotal: own.reduce((sum, i) => sum + (priceOf.get(i.variantId) ?? 0) * i.qty, 0),
    };
  });

  const variants: VariantOption[] = variantRows.map((v) => ({
    id: v.id,
    label: `${v.productName ?? v.productSlug} — ${v.sku}`,
    price: v.price,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('bundles.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('bundles.subtitle')}</p>
      </div>

      <BundlesManager
        initial={rows}
        variants={variants}
        currency={settings?.currency ?? 'JOD'}
      />
    </div>
  );
}
