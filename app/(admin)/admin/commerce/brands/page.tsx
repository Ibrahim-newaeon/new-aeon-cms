// app/(admin)/admin/commerce/brands/page.tsx
import { db } from '@/lib/db';
import { brands, products } from '@/lib/db/schema';
import { asc, count, eq } from 'drizzle-orm';
import { BrandsManager, type BrandRow } from '@/components/admin/brands-manager';

export default async function BrandsPage() {
  // The product count drives the disabled delete button, so the 409 from the
  // API is predictable rather than something the user discovers by clicking.
  const rows = await db
    .select({
      id: brands.id,
      slug: brands.slug,
      name: brands.name,
      logoUrl: brands.logoUrl,
      isActive: brands.isActive,
      sortOrder: brands.sortOrder,
      productCount: count(products.id),
    })
    .from(brands)
    .leftJoin(products, eq(products.brandId, brands.id))
    .groupBy(brands.id, brands.slug, brands.name, brands.logoUrl, brands.isActive, brands.sortOrder)
    .orderBy(asc(brands.sortOrder), asc(brands.name));

  const initial: BrandRow[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logoUrl,
    isActive: r.isActive ?? true,
    sortOrder: r.sortOrder ?? 0,
    productCount: Number(r.productCount),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">العلامات التجارية</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">
          العلامات المتاحة للاختيار عند إنشاء المنتجات. الرقم يوضّح عدد المنتجات المرتبطة.
        </p>
      </div>

      <BrandsManager initial={initial} />
    </div>
  );
}
