// app/(site)/[locale]/bundles/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { productBundles, bundleItems, productVariants } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import { getSettings } from '@/lib/db/queries';
import { commerceEnabled } from '@/lib/commerce/guard';
import { locales, type Locale } from '@/lib/env';
import { BundleCard } from '@/components/site/bundle-card';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === 'ar' ? 'الحزم' : 'Bundles' };
}

export default async function BundlesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  const typedLocale = locale as Locale;

  // Same guard as every other commerce route: with the module off this URL
  // must not exist at all.
  if (!(await commerceEnabled())) notFound();

  const [rows, items, variants, settings] = await Promise.all([
    db
      .select()
      .from(productBundles)
      .where(eq(productBundles.isActive, true))
      .orderBy(asc(productBundles.sortOrder)),
    db.select().from(bundleItems),
    db.select({ id: productVariants.id, price: productVariants.price, stock: productVariants.stock }).from(productVariants),
    getSettings(),
  ]);

  const variantById = new Map(variants.map((v) => [v.id, v]));
  const currency = settings?.currency ?? 'JOD';
  const ar = typedLocale === 'ar';

  const bundles = rows.map((bundle) => {
    const own = items.filter((i) => i.bundleId === bundle.id);

    return {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      price: bundle.price,
      image: bundle.image,
      partsTotal: own.reduce((sum, i) => sum + (variantById.get(i.variantId)?.price ?? 0) * i.qty, 0),
      // A bundle whose parts are not all in stock cannot be bought as priced,
      // so it is shown as unavailable rather than failing at checkout.
      available:
        own.length > 0 &&
        own.every((i) => (variantById.get(i.variantId)?.stock ?? 0) >= i.qty),
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-site-ink">{ar ? 'الحزم' : 'Bundles'}</h1>
        <p className="mt-2 text-site-ink-muted">
          {ar
            ? 'مجموعات مختارة بسعر واحد أقل من شراء القطع منفردة.'
            : 'Curated sets at one price, below the cost of buying the pieces separately.'}
        </p>
      </header>

      {bundles.length === 0 ? (
        <p className="text-site-ink-muted">{ar ? 'لا توجد حزم حالياً.' : 'No bundles right now.'}</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-test-id="bundle-list">
          {bundles.map((bundle) => (
            <BundleCard key={bundle.id} bundle={bundle} locale={typedLocale} currency={currency} />
          ))}
        </ul>
      )}
    </div>
  );
}
